// Test the exact user input
const testInput = "install skill: https://auth.clawdhub.com/api/v1/download?slug=weather-2";
console.log(`Testing input: "${testInput}"`);

const trimmedInput = testInput.trim();
console.log(`Trimmed: "${trimmedInput}"`);

let skillUrl = '';

if (trimmedInput.toLowerCase().startsWith('install skill - ')) {
  skillUrl = trimmedInput.substring('install skill - '.length).trim();
  console.log('Matched dash format');
}
else if (trimmedInput.toLowerCase().startsWith('install skill ')) {
  skillUrl = trimmedInput.substring('install skill '.length).trim();
  console.log('Matched space format');
}
else if (trimmedInput.toLowerCase().startsWith('install skill:')) {
  skillUrl = trimmedInput.substring('install skill:'.length).trim();
  console.log('Matched colon format');
}
else if (trimmedInput.toLowerCase().startsWith('install ')) {
  const parts = trimmedInput.split(/\s+/);
  console.log('Parts:', parts);
  if (parts.length >= 2) {
    if (parts.length >= 4 && parts[2].toLowerCase() === 'from') {
      skillUrl = parts.slice(3).join(' ');
    }
    else {
      skillUrl = parts[1];
    }
  }
  console.log('Matched generic install format');
}

console.log(`Extracted skillUrl before quote stripping: "${skillUrl}"`);

// Strip surrounding quotes from the URL if present
skillUrl = skillUrl.replace(/^["']|["']$/g, '');

console.log(`Extracted skillUrl after quote stripping: "${skillUrl}"`);
console.log(`Starts with 'http': ${skillUrl.startsWith('http')}`);
console.log(`skillUrl length: ${skillUrl.length}`);