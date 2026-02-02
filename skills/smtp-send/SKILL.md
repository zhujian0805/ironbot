---
name: smtp-send
description: Send emails via SMTP. Execute using run_powershell ONLY. Command: node skills/smtp-send/scripts/send_email.js --to <recipient> --subject <subject> --body <body> [--html]
---

# SMTP Send

**CRITICAL: This skill ONLY works with Node.js. Do NOT use Python or any other method.**

## Execute This Command ONLY

```powershell
# Plain text email
node skills/smtp-send/scripts/send_email.js --to recipient@example.com --subject "Subject" --body "Message body"

# HTML formatted email (recommended for pretty formatting)
node skills/smtp-send/scripts/send_email.js --to recipient@example.com --subject "Subject" --body "<h1>Title</h1><p>Formatted message</p>" --html
```

## How To Send an Email

**Step 1:** Use `run_powershell` tool ONLY
**Step 2:** Execute: `node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "Your Subject" --body "Your message" --html`
**Step 3:** Wait for success message: "EMAIL_SENT_TO:recipient"
**Step 4:** Done - email is sent

## HTML Email Formatting (Recommended)

For pretty, formatted emails, always use the `--html` flag and format your body with HTML:

### Basic HTML Structure
```html
<h1>Main Title</h1>
<p>This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
<ul>
  <li>List item 1</li>
  <li>List item 2</li>
</ul>
<p><a href="https://example.com">Click here</a> for more info.</p>
```

### System Information Example
```html
<h2>System Disk Information</h2>
<table border="1" style="border-collapse: collapse;">
  <tr style="background-color: #f0f0f0;">
    <th style="padding: 8px;">Disk</th>
    <th style="padding: 8px;">Size</th>
    <th style="padding: 8px;">Status</th>
  </tr>
  <tr>
    <td style="padding: 8px;">Disk 0</td>
    <td style="padding: 8px;">1.82 TB</td>
    <td style="padding: 8px;">Healthy</td>
  </tr>
</table>
```

### Command Example
```powershell
node skills/smtp-send/scripts/send_email.js --to jzhu@blizzard.com --subject "System Report" --body "<h1>Daily System Report</h1><p>System is running normally.</p><ul><li>CPU: 45%</li><li>Memory: 60%</li></ul>" --html
```

## Rules - FOLLOW THESE EXACTLY

1. **ALWAYS use run_powershell** - this is Windows
2. **ONLY execute the node command above** - nothing else
3. **Use --html flag for formatted emails** - makes emails look professional
4. **Wait for output** - you'll see "EMAIL_SENT_TO:recipient"
5. **Do NOT:**
   - Create Python scripts
   - Use Send-MailMessage
   - Use run_bash
   - Try alternatives
   - Read any Python files
   - Look for other email methods
- App passwords recommended over regular passwords
- Config file should not be committed to version control
