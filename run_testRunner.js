const { generateHtmlReport } = require('./testRunner');
const fs = require('fs');
const path = require('path');

async function run() {
  try {
    const html = await generateHtmlReport();
    const outputPath = path.join(__dirname, 'test_report.html');
    fs.writeFileSync(outputPath, html);
    console.log(`Test report successfully generated at: ${outputPath}`);
  } catch (error) {
    console.error("Error generating test report:", error);
  }
}

run();
