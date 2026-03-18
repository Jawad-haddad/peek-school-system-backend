const fs = require('fs');
const path = require('path');
const results = JSON.parse(fs.readFileSync('jest_results.json', 'utf8'));
const failedTests = results.testResults.filter(r => r.status === 'failed');

let output = "";
failedTests.forEach(suite => {
  output += `\nFAIL: ${path.relative(process.cwd(), suite.name)}\n`;
  suite.assertionResults.filter(a => a.status === 'failed').forEach(assert => {
    output += `  x ${assert.ancestorTitles.join(' > ')} > ${assert.title}\n`;
    output += `    ${assert.failureMessages[0]?.split('\n').slice(0, 5).join('\n    ')}\n`;
  });
  if (suite.message && suite.assertionResults.filter(a => a.status === 'failed').length === 0) {
      output += `   Suite Error:\n    ${suite.message.split('\n').slice(0, 10).join('\n    ')}\n`;
  }
});
output += `\nTotal failures: ${results.numFailedTests} in ${failedTests.length} suites.\n`;
fs.writeFileSync('parsed_failures.utf8.txt', output, 'utf8');
