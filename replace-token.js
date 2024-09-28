const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables from .env file

const filePath = path.join(__dirname, 'main.js');
const accessToken = process.env.MAPBOX_ACCESS_TOKEN;

console.log(accessToken);

fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
        return console.log(err);
    }
    const result = data.replace(/YOUR_MAPBOX_ACCESS_TOKEN/g, accessToken);

    fs.writeFile(filePath, result, 'utf8', (err) => {
        if (err) return console.log(err);
    });
});