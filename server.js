require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get the Mapbox token with origin validation
app.get('/mapbox-token', (req, res) => {
  const allowedOrigins = [
    'https://www.bungendorerfs.org',
    'http://localhost:3000',
    'https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net'
  ];
  const origin = req.headers.origin || req.headers.referer;
  
  // Allow requests without origin (same-origin requests)
  if (origin && !allowedOrigins.some(allowed => origin.includes(allowed))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
});

// Proxy endpoint for contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_CONTACT_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_CONTACT_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Proxy endpoint for calendar events
app.get('/api/calendar-events', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_CALENDAR_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_CALENDAR_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Proxy endpoint for fire incidents (map data)
app.get('/api/fire-incidents', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_INCIDENTS_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_INCIDENTS_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'X-Request-ID': 'Get-Fire-Incidents',
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching fire incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// Proxy endpoint for fire danger rating
app.get('/api/fire-danger', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_FIRE_DANGER_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl);
    const data = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(data);
  } catch (error) {
    console.error('Error fetching fire danger:', error);
    res.status(500).json({ error: 'Failed to fetch fire danger' });
  }
});

// Proxy endpoint for Mapbox token (used by map.js)
app.post('/api/mapbox-token', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_MAPBOX_TOKEN_WEBHOOK_URL;
    
    // If not configured, fall back to local token
    if (!webhookUrl) {
      return res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': 'Get-Mapbox-Token',
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Mapbox token:', error);
    // Fall back to local token on error
    res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});