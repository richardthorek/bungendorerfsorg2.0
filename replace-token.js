const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file

const targetPath = process.argv[2] || path.join(__dirname, 'public', 'js', 'main.js');
const filePath = path.isAbsolute(targetPath) ? targetPath : path.join(__dirname, targetPath);
const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        return console.log(err);
    }
    const result = data.replace(/YOUR_MAPBOX_ACCESS_TOKEN/g, accessToken);

    fs.writeFile(filePath, result, 'utf8', (err) => {
        if (err) return console.log(err);
    });
});