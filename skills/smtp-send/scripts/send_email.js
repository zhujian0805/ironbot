#!/usr/bin/env node
/**
 * Send email via SMTP.
 *
 * Usage:
 *     node send_email.js --to <recipient> --subject <subject> --body <body> [--html]
 *
 * Environment variables (or ~/.smtp_config):
 *     SMTP_HOST       - SMTP server hostname (e.g., smtp.gmail.com)
 *     SMTP_PORT       - SMTP server port (default: 587 for TLS, 465 for SSL, 25 for open relay)
 *     SMTP_USER       - SMTP username (optional for open relay SMTP servers)
 *     SMTP_PASSWORD   - SMTP password or app password (optional for open relay SMTP servers)
 *     SMTP_FROM       - From email address (defaults to SMTP_USER)
 *     SMTP_USE_SSL    - Use SSL instead of TLS (set to 'true' for port 465)
 */

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import os from 'os';

function validateAndFixHtml(html) {
  console.log('[SMTP-SKILL] Starting HTML validation and fixing');
  console.log(`[SMTP-SKILL] HTML length: ${html.length} characters`);
  
  const issues = [];
  let fixedHtml = html;
  
  // Check for unclosed tags
  const tagRegex = /<(\w+)[^>]*>/g;
  const closedTagRegex = /<\/(\w+)>/g;
  
  const openTags = {};
  let match;
  
  // Count opening tags
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    // Skip self-closing tags
    if (!['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'].includes(tagName)) {
      openTags[tagName] = (openTags[tagName] || 0) + 1;
    }
  }
  
  // Count closing tags
  const closedTags = {};
  const closedTagRegex2 = /<\/(\w+)>/g;
  while ((match = closedTagRegex2.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    closedTags[tagName] = (closedTags[tagName] || 0) + 1;
  }
  
  // Check for mismatches
  for (const tag in openTags) {
    const opened = openTags[tag];
    const closed = closedTags[tag] || 0;
    if (opened !== closed) {
      issues.push(`Tag mismatch: <${tag}> opened ${opened} times but closed ${closed} times`);
    }
  }
  
  // Check for common HTML issues
  if (!html.includes('<table')) {
    console.log('[SMTP-SKILL] No table tag found in HTML');
  }
  
  // Check for unclosed table elements
  const tableRegex = /<table[^>]*>[\s\S]*<\/table>/i;
  if (!tableRegex.test(html)) {
    issues.push('Table tag not properly closed');
  }
  
  // Check for unclosed tr elements
  const trCount = (html.match(/<tr[^>]*>/gi) || []).length;
  const trCloseCount = (html.match(/<\/tr>/gi) || []).length;
  if (trCount !== trCloseCount) {
    issues.push(`Table row mismatch: <tr> opened ${trCount} times but closed ${trCloseCount} times`);
  }
  
  // Check for unclosed td/th elements
  const tdCount = (html.match(/<td[^>]*>/gi) || []).length;
  const tdCloseCount = (html.match(/<\/td>/gi) || []).length;
  if (tdCount !== tdCloseCount) {
    issues.push(`Table data mismatch: <td> opened ${tdCount} times but closed ${tdCloseCount} times`);
  }
  
  const thCount = (html.match(/<th[^>]*>/gi) || []).length;
  const thCloseCount = (html.match(/<\/th>/gi) || []).length;
  if (thCount !== thCloseCount) {
    issues.push(`Table header mismatch: <th> opened ${thCount} times but closed ${thCloseCount} times`);
  }
  
  // Check for unescaped special characters in content (not in attributes)
  const specialCharRegex = />[^<]*[<>&]/;
  if (specialCharRegex.test(html)) {
    console.log('[SMTP-SKILL] Warning: Special characters found in content (may need escaping)');
  }
  
  // Log issues
  if (issues.length > 0) {
    console.log(`[SMTP-SKILL] Found ${issues.length} HTML formatting issue(s):`);
    issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
    
    // Try to fix unclosed tags
    console.log('[SMTP-SKILL] Attempting to fix HTML issues...');
    
    // Fix unclosed tr tags
    if (trCount !== trCloseCount && trCount > trCloseCount) {
      const missingCount = trCount - trCloseCount;
      fixedHtml = fixedHtml + '</tr>'.repeat(missingCount);
      console.log(`[SMTP-SKILL] Added ${missingCount} missing </tr> tag(s)`);
    }
    
    // Fix unclosed td tags
    if (tdCount !== tdCloseCount && tdCount > tdCloseCount) {
      const missingCount = tdCount - tdCloseCount;
      fixedHtml = fixedHtml + '</td>'.repeat(missingCount);
      console.log(`[SMTP-SKILL] Added ${missingCount} missing </td> tag(s)`);
    }
    
    // Fix unclosed th tags
    if (thCount !== thCloseCount && thCount > thCloseCount) {
      const missingCount = thCount - thCloseCount;
      fixedHtml = fixedHtml + '</th>'.repeat(missingCount);
      console.log(`[SMTP-SKILL] Added ${missingCount} missing </th> tag(s)`);
    }
    
    // Fix unclosed table tags
    if (!tableRegex.test(fixedHtml)) {
      if ((fixedHtml.match(/<table/gi) || []).length > (fixedHtml.match(/<\/table>/gi) || []).length) {
        fixedHtml = fixedHtml + '</table>';
        console.log('[SMTP-SKILL] Added missing </table> tag');
      }
    }
  } else {
    console.log('[SMTP-SKILL] HTML format validation passed - no issues found');
  }
  
  
  console.log(`[SMTP-SKILL] HTML validation complete. Final HTML length: ${fixedHtml.length} characters`);
  
  return fixedHtml;
}

function formatAsTable(body) {
  console.log('[SMTP-SKILL] Starting table formatting process');
  const lines = body.split('\n').filter(line => line.trim());
  console.log(`[SMTP-SKILL] Processing ${lines.length} lines of content`);
  
  const tables = [];
  let currentTable = [];
  const seenKeys = new Set();
  
  for (const line of lines) {
    if (line.includes(' : ')) {
      const [key, ...valueParts] = line.split(' : ');
      const cleanKey = key.trim();
      const value = valueParts.join(' : ').trim();
      
      // If we've seen this key before, start a new table
      if (seenKeys.has(cleanKey)) {
        if (currentTable.length > 0) {
          console.log(`[SMTP-SKILL] Completed table with ${currentTable.length} rows, starting new table`);
          tables.push(currentTable);
          currentTable = [];
          seenKeys.clear();
        }
      }
      
      currentTable.push({ key: cleanKey, value });
      seenKeys.add(cleanKey);
    } else if (line.trim() === '') {
      if (currentTable.length > 0) {
        console.log(`[SMTP-SKILL] Found blank line, completing table with ${currentTable.length} rows`);
        tables.push(currentTable);
        currentTable = [];
        seenKeys.clear();
      }
    }
  }
  
  if (currentTable.length > 0) {
    console.log(`[SMTP-SKILL] Adding final table with ${currentTable.length} rows`);
    tables.push(currentTable);
  }
  
  if (tables.length === 0) {
    console.log('[SMTP-SKILL] No tabular data found, returning original content');
    return body; // No tabular data found, return original
  }
  
  console.log(`[SMTP-SKILL] Generated ${tables.length} HTML table(s)`);
  let html = '';
  for (const table of tables) {
    html += '<table border="1" style="border-collapse: collapse; margin-bottom: 20px;">\n';
    html += '<tr style="background-color: #f0f0f0;"><th style="padding: 8px;">Property</th><th style="padding: 8px;">Value</th></tr>\n';
    for (const row of table) {
      html += `<tr><td style="padding: 8px;">${row.key}</td><td style="padding: 8px;">${row.value}</td></tr>\n`;
    }
    html += '</table>\n';
  }
  
  console.log(`[SMTP-SKILL] Table formatting complete, HTML length: ${html.length} characters`);
  return html;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        result[key] = args[i + 1];
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  
  return result;
}

function loadConfig() {
  console.log('[SMTP-SKILL] Loading SMTP configuration');
  const config = {};
  const configFile = path.join(os.homedir(), '.smtp_config');
  
  console.log(`[SMTP-SKILL] Checking for config file: ${configFile}`);
  
  // Try to load from config file
  if (fs.existsSync(configFile)) {
    console.log('[SMTP-SKILL] Config file exists, loading from file');
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      Object.assign(config, JSON.parse(content));
      console.log('[SMTP-SKILL] Config loaded successfully from file');
    } catch (e) {
      console.error(`[SMTP-SKILL] Warning: Failed to load ${configFile}: ${e.message}`);
    }
  } else {
    console.log('[SMTP-SKILL] Config file does not exist');
  }
  
  // Environment variables override config file
  config.host = process.env.SMTP_HOST || config.host;
  config.port = parseInt(process.env.SMTP_PORT || config.port || '587', 10);
  config.user = process.env.SMTP_USER || config.user || '';
  config.password = process.env.SMTP_PASSWORD || config.password || '';
  config.from = process.env.SMTP_FROM || config.from || config.user;
  
  const useSSLValue = process.env.SMTP_USE_SSL || config.use_ssl || 'false';
  config.secure = String(useSSLValue).toLowerCase() === 'true';
  
  console.log(`[SMTP-SKILL] Config sources: env=${!!process.env.SMTP_HOST}, file=${fs.existsSync(configFile)}`);
  
  // If no config exists and we're running for the first time, create a default config
  // This handles the case where the LLM needs to create config for internal MTA
  if (!config.host) {
    console.log('[SMTP-SKILL] No SMTP config found. Creating default config for internal MTA...');
    const defaultConfig = {
      host: '10.63.6.154',
      port: 25,
      user: '',
      password: '',
      from: 'jzhu@blizzard.com',
      use_ssl: false
    };
    try {
      fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
      console.log(`[SMTP-SKILL] Created ${configFile} with default settings`);
      Object.assign(config, defaultConfig);
    } catch (e) {
      console.error(`[SMTP-SKILL] Failed to create config file: ${e.message}`);
      process.exit(1);
    }
  }
  
  console.log(`[SMTP-SKILL] Final config: host=${config.host}, port=${config.port}, from=${config.from}`);
  return config;
}

async function sendEmail(config, to, subject, body, isHtml) {
  console.log(`[SMTP-SKILL] Creating SMTP transport: host=${config.host}, port=${config.port}, secure=${config.secure}`);
  
  try {
    // For port 25 (open relay), don't use TLS
    const transportOptions = {
      host: config.host,
      port: config.port,
      secure: config.secure, // use SSL/TLS for port 465
      tls: config.port === 25 ? false : { rejectUnauthorized: false }, // skip STARTTLS for port 25
    };
    
    // Only add authentication if credentials provided
    if (config.user && config.password) {
      transportOptions.auth = {
        user: config.user,
        pass: config.password
      };
      console.log('[SMTP-SKILL] Using authentication for SMTP connection');
    } else {
      console.log('[SMTP-SKILL] No authentication configured for SMTP connection');
    }
    
    const transporter = nodemailer.createTransport(transportOptions);
    console.log('[SMTP-SKILL] SMTP transporter created successfully');
    
    const mailOptions = {
      from: config.from,
      to: to,
      subject: subject,
      [isHtml ? 'html' : 'text']: body
    };
    
    console.log(`[SMTP-SKILL] Sending email: from=${config.from}, to=${to}, subject=${subject}, contentType=${isHtml ? 'html' : 'text'}`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[SMTP-SKILL] Email sent successfully: messageId=${info.messageId}`);
    
    return true;
  } catch (error) {
    console.error(`[SMTP-SKILL] Email send failed: ${error.message}`);
    console.error(`[SMTP-SKILL] Error details:`, error);
    return false;
  }
}

async function main() {
  console.log('[SMTP-SKILL] Starting email send operation');
  
  const args = parseArgs();
  console.log(`[SMTP-SKILL] Parsed arguments: to=${args.to}, subject=${args.subject}, hasBody=${!!args.body}, hasBodyFile=${!!args['body-file']}, html=${!!args.html}, formatTable=${!!args['format-table']}`);
  
  if (!args.to || !args.subject || (!args.body && !args['body-file'])) {
    console.error('[SMTP-SKILL] ERROR: Missing required arguments. Need --to, --subject, and either --body or --body-file');
    process.exit(1);
  }
  
  let body = args.body;
  if (args['body-file']) {
    console.log(`[SMTP-SKILL] Reading body from file: ${args['body-file']}`);
    try {
      body = fs.readFileSync(args['body-file'], 'utf-8');
      console.log(`[SMTP-SKILL] Successfully read ${body.length} characters from file`);
    } catch (error) {
      console.error(`[SMTP-SKILL] ERROR: Failed to read body file: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Format as table only if explicitly requested with --format-table flag
  // Do NOT auto-format just because content contains ' : ' pattern
  const isAlreadyHtml = body.includes('<') && body.includes('>');
  const shouldFormatTable = args['format-table'] && !isAlreadyHtml;
  
  console.log(`[SMTP-SKILL] Table formatting: shouldFormat=${shouldFormatTable}, isAlreadyHtml=${isAlreadyHtml}, formatTableFlag=${!!args['format-table']}`);
  
  if (shouldFormatTable) {
    console.log('[SMTP-SKILL] Applying table formatting to body content');
    body = formatAsTable(body);
    args.html = true; // Force HTML for table formatting
    console.log(`[SMTP-SKILL] Table formatting complete, body length: ${body.length} characters`);
  } else {
    console.log('[SMTP-SKILL] Skipping table formatting (only format with explicit --format-table flag)');
  }
  
  const config = loadConfig();
  console.log(`[SMTP-SKILL] Using SMTP config: ${config.host}:${config.port}, from: ${config.from}, secure: ${config.secure}, auth: ${config.user ? 'yes' : 'no'}`);
  
  // Validate and fix HTML if applicable
  if (args.html) {
    console.log('[SMTP-SKILL] HTML email detected, performing format validation');
    body = validateAndFixHtml(body);
  }
  
  console.log(`[SMTP-SKILL] Preparing to send email: to=${args.to}, subject=${args.subject}, html=${args.html}, bodyPreview=${body.substring(0, 100)}${body.length > 100 ? '...' : ''}`);
  
  const success = await sendEmail(config, args.to, args.subject, body, args.html);
  
  // Output simple, clear message
  if (success) {
    console.log(`[SMTP-SKILL] SUCCESS: EMAIL_SENT_TO:${args.to}`);
  } else {
    console.log(`[SMTP-SKILL] FAILURE: EMAIL_FAILED_TO:${args.to}`);
  }
  
  console.log('[SMTP-SKILL] Email send operation completed');
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
