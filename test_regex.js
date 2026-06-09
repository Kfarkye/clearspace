const DOMAIN_PATTERN = /(^|[^@\w])([a-zA-Z0-9-]+\.(to|com|org|net|io|co|app|dev|ai|gg|tv|live|bet|sports|xyz))(?!\S*@)\b/gi;
const input = "Check this adk.dev out and github.io also test@google.dev";
console.log(input.replace(DOMAIN_PATTERN, (match, prefix, domain) => `${prefix}https://${domain}`));
