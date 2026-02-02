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
  const config = {};
  const configFile = path.join(os.homedir(), '.smtp_config');
  
  // Try to load from config file
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      Object.assign(config, JSON.parse(content));
    } catch (e) {
      console.error(`Warning: Failed to load ${configFile}: ${e.message}`);
    }
  }
  
  // Environment variables override config file
  config.host = process.env.SMTP_HOST || config.host;
  config.port = parseInt(process.env.SMTP_PORT || config.port || '587', 10);
  config.user = process.env.SMTP_USER || config.user || '';
  config.password = process.env.SMTP_PASSWORD || config.password || '';
  config.from = process.env.SMTP_FROM || config.from || config.user;
  
  const useSSLValue = process.env.SMTP_USE_SSL || config.use_ssl || 'false';
  config.secure = String(useSSLValue).toLowerCase() === 'true';
  
  // If no config exists and we're running for the first time, create a default config
  // This handles the case where the LLM needs to create config for internal MTA
  if (!config.host) {
    console.log('No SMTP config found. Creating default config for internal MTA...');
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
      console.log(`Created ${configFile} with default settings`);
      Object.assign(config, defaultConfig);
    } catch (e) {
      console.error(`Failed to create config file: ${e.message}`);
      process.exit(1);
    }
  }
  
  return config;
}

async function sendEmail(config, to, subject, body, isHtml) {
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
    }
    
    const transporter = nodemailer.createTransport(transportOptions);
    
    const mailOptions = {
      from: config.from,
      to: to,
      subject: subject,
      [isHtml ? 'html' : 'text']: body
    };
    
    const info = await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const args = parseArgs();
  
  if (!args.to || !args.subject || !args.body) {
    console.error('Error: Missing required arguments');
    process.exit(1);
  }
  
  const config = loadConfig();
  const success = await sendEmail(config, args.to, args.subject, args.body, args.html);
  
  // Output simple, clear message
  if (success) {
    console.log(`EMAIL_SENT_TO:${args.to}`);
  } else {
    console.log(`EMAIL_FAILED_TO:${args.to}`);
  }
  
  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
