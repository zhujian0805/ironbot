#!/usr/bin/env python3
"""
Extract calendar events and action points from forwarded emails.
Outputs structured JSON for further processing.
"""

import json
import re
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

def parse_date(date_str: str, default_year: int = None) -> Optional[Dict[str, Any]]:
    """Parse various date formats and return structured date info."""
    from datetime import datetime
    
    if default_year is None:
        default_year = datetime.now().year
    
    date_patterns = [
        # January 15, 2026
        (r'(\w+)\s+(\d{1,2}),?\s+(\d{4})', lambda m: {
            'month': m.group(1),
            'day': int(m.group(2)),
            'year': int(m.group(3))
        }),
        # 15 January 2026
        (r'(\d{1,2})\s+(\w+)\s+(\d{4})', lambda m: {
            'day': int(m.group(1)),
            'month': m.group(2),
            'year': int(m.group(3))
        }),
        # 01/15/2026 or 15/01/2026
        (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', lambda m: {
            'month_num': int(m.group(1)),
            'day': int(m.group(2)),
            'year': int(m.group(3))
        }),
        # 2026-01-15 (ISO)
        (r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})', lambda m: {
            'year': int(m.group(1)),
            'month_num': int(m.group(2)),
            'day': int(m.group(3))
        }),
        # Wednesday January 15 (no year - use current year)
        (r'(?:\w+\s+)?(\w+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?', lambda m: {
            'month': m.group(1),
            'day': int(m.group(2)),
            'year': int(m.group(3)) if m.group(3) else default_year
        }),
        # January 15 (no year - use current year)
        (r'\b(\w+)\s+(\d{1,2})\b(?!\s*,?\s*\d{4})', lambda m: {
            'month': m.group(1),
            'day': int(m.group(2)),
            'year': default_year
        }),
    ]
    
    month_map = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }
    
    for pattern, extractor in date_patterns:
        match = re.search(pattern, date_str, re.IGNORECASE)
        if match:
            result = extractor(match)
            if 'month' in result and isinstance(result['month'], str):
                month_name = result['month'].lower()
                result['month_num'] = month_map.get(month_name, 1)
            return result
    return None

def parse_time(time_str: str) -> Optional[Dict[str, int]]:
    """Parse time strings like '2:30 PM', '14:30', '9am', etc."""
    patterns = [
        # 2:30 PM / 2:30 pm
        (r'(\d{1,2}):(\d{2})\s*(am|pm)', re.IGNORECASE),
        # 2 PM / 2pm
        (r'(\d{1,2})\s*(am|pm)', re.IGNORECASE),
        # 14:30 (24h)
        (r'(\d{1,2}):(\d{2})', 0),
    ]
    
    for pattern, flags in patterns:
        match = re.search(pattern, time_str, flags) if flags else re.search(pattern, time_str)
        if match:
            hour = int(match.group(1))
            minute = int(match.group(2)) if len(match.groups()) > 1 and match.group(2).isdigit() else 0
            
            # Handle AM/PM
            if len(match.groups()) > 1 and match.group(2).lower() in ['am', 'pm']:
                ampm = match.group(2).lower()
            elif len(match.groups()) > 2 and match.group(3):
                ampm = match.group(3).lower()
            else:
                ampm = None
            
            if ampm == 'pm' and hour != 12:
                hour += 12
            elif ampm == 'am' and hour == 12:
                hour = 0
            
            return {'hour': hour, 'minute': minute}
    return None

def is_full_day_event(text: str) -> bool:
    """Check if event appears to be a full-day event."""
    full_day_indicators = [
        'all day', 'fullday', 'full day', 'whole day',
        '9am.*5pm', '9:00.*17:00', '09:00.*17:00',
        'business hours', 'work day', 'working day'
    ]
    text_lower = text.lower()
    for indicator in full_day_indicators:
        if re.search(indicator, text_lower):
            return True
    return False

def is_header_line(line: str) -> bool:
    """Check if a line is an email header (not actual content)."""
    header_patterns = [
        r'^from:\s*.+$',
        r'^date:\s*.+$',
        r'^subject:\s*.+$',
        r'^to:\s*.+$',
        r'^cc:\s*.+$',
        r'^bcc:\s*.+$',
        r'^reply-to:\s*.+$',
        r'^[-]+\s*forwarded message\s*[-]+',
        r'^[-]+\s*original message\s*[-]+',
        r'^on .* wrote:',
        r'^sent from my',
    ]
    line_lower = line.lower().strip()
    for pattern in header_patterns:
        if re.match(pattern, line_lower, re.IGNORECASE):
            return True
    return False

def extract_events(email_content: str, content_lines: List[str] = None) -> List[Dict[str, Any]]:
    """Extract calendar events from email content."""
    events = []
    
    # Common event patterns - more flexible to catch various phrasings
    event_patterns = [
        # Meeting on January 15 at 2:30 PM / meet Wednesday at 2:30 PM
        r'(?:\bmeeting\b|\bcall\b|\bsync\b|\bstandup\b|\breview\b|\bdemo\b|\binterview\b|\bappointment\b|\bevent\b|\bconference\b|\bworkshop\b|\bwebinar\b|\btraining\b|\bmeet\b)\s+(?:on|at|this|next|us|for)?\s+(.+?)(?:\.|,|;|\n|$)',
        # Join us on January 15 for...
        r'(?:join us|you are invited|please attend|mark your calendar|save the date)\s+(?:on|for|this|next)?\s+(.+?)(?:\.|,|;|\n|$)',
        # Let's meet / Let us meet
        r'(?:let\'s|let us)\s+(?:meet|have|schedule)\s+(.+?)(?:\.|,|;|\n|$)',
        # When: January 15, 2026 2:30 PM (but not email headers)
        r'\b(?:when|date|time):\s*(.+?)(?:\n|$)',
        # Date: January 15 Time: 2:30 PM (but not email headers)
        r'\b(?:date|day):\s*([^\n]+?)(?:\s+time:\s*([^\n]+))?',
    ]
    
    if content_lines is None:
        content_lines = get_content_lines(email_content)
    
    for i, line in enumerate(content_lines):
        line = line.strip()
        if not line or is_header_line(line):
            continue
        
        for pattern in event_patterns:
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                event_text = match.group(0)
                context = ' '.join(content_lines[max(0, i-2):min(len(content_lines), i+3)])
                
                # Try to extract date
                date_info = parse_date(event_text)
                if not date_info:
                    date_info = parse_date(context)
                
                if date_info:
                    # Try to extract time
                    time_info = parse_time(event_text)
                    if not time_info:
                        time_info = parse_time(context)
                    
                    # Check if full day event
                    is_full_day = is_full_day_event(event_text) or is_full_day_event(context)
                    
                    # Extract title/subject - be smarter about it
                    title_patterns = [
                        r'(?:subject|title|topic|re|about):\s*([^\n]+)',
                        r'(?:meeting|call|sync|interview|review|workshop|webinar|training)\s+(?:about|on|regarding|for)\s+(.+?)(?:\.|,|;|\n|$)',
                    ]
                    title = None
                    for tp in title_patterns:
                        title_match = re.search(tp, context, re.IGNORECASE)
                        if title_match:
                            title = title_match.group(1).strip()
                            break
                    
                    if not title:
                        # Extract meaningful words from the event text
                        # Remove common filler words and extract the purpose
                        purpose_match = re.search(r'(?:to|for)\s+(.+?)(?:\.|,|;|\n|$)', event_text, re.IGNORECASE)
                        if purpose_match:
                            title = purpose_match.group(1).strip()[:80]
                        else:
                            # Use the event text itself, cleaned up
                            title = re.sub(r'^(?:let\'s|let us|join us|please attend)\s+', '', event_text, flags=re.IGNORECASE)[:80]
                    
                    # Clean up the title
                    title = re.sub(r'\s+', ' ', title).strip()
                    if len(title) > 80:
                        title = title[:77] + '...'
                    
                    event = {
                        'type': 'event',
                        'title': title,
                        'date': date_info,
                        'time': time_info,
                        'is_full_day': is_full_day,
                        'source_text': event_text,
                        'context': context[:200],
                        'raw_line': line
                    }
                    events.append(event)
    
    # Remove duplicates based on date/time similarity
    unique_events = []
    for event in events:
        is_duplicate = False
        for existing in unique_events:
            if (event['date'] == existing['date'] and 
                event.get('time') == existing.get('time') and
                event['title'][:30] == existing['title'][:30]):
                is_duplicate = True
                break
        if not is_duplicate:
            unique_events.append(event)
    
    return unique_events

def extract_action_items(email_content: str, content_lines: List[str] = None) -> List[Dict[str, Any]]:
    """Extract action items and tasks from email."""
    actions = []
    
    # Action item patterns
    action_patterns = [
        # Action: Do something
        r'(?:action|task|todo|to-do|follow.up|followup):\s*([^\n]+)',
        # Please do X
        r'(?:please|kindly)\s+(.+?)(?:\.|,|;|\n|$)',
        # Need to / Needs to / We need to
        r'(?:need|needs|we need)\s+to\s+(.+?)(?:\.|,|;|\n|$)',
        # Should do / Must do
        r'(?:should|must|will need to)\s+(.+?)(?:\.|,|;|\n|$)',
        # Bullet points with action verbs
        r'[-*•]\s*(?:\[ \]|\[x\]|\[X\])?\s*(.+?)(?:\n|$)',
    ]
    
    if content_lines is None:
        lines = email_content.split('\n')
        content_lines = []
        in_headers = True
        for line in lines:
            if in_headers:
                if is_header_line(line) or line.strip() == '':
                    continue
                else:
                    in_headers = False
                    content_lines.append(line)
            else:
                content_lines.append(line)
    
    for i, line in enumerate(content_lines):
        line = line.strip()
        if not line or is_header_line(line):
            continue
        
        for pattern in action_patterns:
            matches = re.finditer(pattern, line, re.IGNORECASE)
            for match in matches:
                action_text = match.group(1) if len(match.groups()) > 0 else match.group(0)
                
                # Filter out non-action items and noise
                non_action_words = ['meeting', 'call', 'event', 'conference', 'webinar', 'workshop', 'forwarded message', 'original message']
                if any(word in action_text.lower() for word in non_action_words):
                    continue
                
                # Skip very short or noise text
                if len(action_text.strip()) < 10:
                    continue
                
                # Skip if it looks like an event description (contains date patterns)
                if re.search(r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b', action_text, re.IGNORECASE):
                    # Check if it's actually a deadline phrase
                    if not re.search(r'\b(by|due|before|deadline)\b', action_text, re.IGNORECASE):
                        continue
                
                # Check for deadline
                deadline = parse_date(action_text)
                if not deadline:
                    # Check surrounding context
                    context = ' '.join(content_lines[max(0, i-2):min(len(content_lines), i+3)])
                    deadline = parse_date(context)
                
                action = {
                    'type': 'action',
                    'text': action_text.strip()[:200],
                    'deadline': deadline,
                    'source_line': line
                }
                actions.append(action)
    
    return actions

def get_content_lines(email_content: str) -> List[str]:
    """Split content and filter out email headers."""
    lines = email_content.split('\n')
    content_lines = []
    in_headers = True
    for line in lines:
        if in_headers:
            if is_header_line(line) or line.strip() == '':
                continue
            else:
                in_headers = False
                content_lines.append(line)
        else:
            content_lines.append(line)
    return content_lines

def main():
    if len(sys.argv) < 2:
        print("Usage: extract_events.py <email_file_or_text>", file=sys.stderr)
        sys.exit(1)
    
    # Read from file or stdin
    if sys.argv[1] == '-':
        content = sys.stdin.read()
    else:
        try:
            with open(sys.argv[1], 'r') as f:
                content = f.read()
        except FileNotFoundError:
            content = sys.argv[1]
    
    # Get filtered content lines
    content_lines = get_content_lines(content)
    
    events = extract_events(content, content_lines)
    actions = extract_action_items(content, content_lines)
    
    result = {
        'events': events,
        'actions': actions,
        'extracted_at': datetime.now().isoformat()
    }
    
    print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
