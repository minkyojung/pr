/**
 * Test GitHub Webhook
 *
 * Sends a mock GitHub webhook event to test the endpoint
 */

const crypto = require('crypto');
const http = require('http');

// Mock GitHub Issue event
const mockEvent = {
  action: 'opened',
  issue: {
    id: 1234567890,
    number: 42,
    title: 'Test Issue from Mock Webhook',
    body: 'This is a test issue created to verify webhook processing',
    state: 'open',
    user: {
      login: 'testuser',
      id: 12345,
      avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      html_url: 'https://github.com/testuser',
      type: 'User',
    },
    assignees: [],
    labels: [
      {
        id: 1,
        name: 'bug',
        color: 'd73a4a',
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    closed_at: null,
    html_url: 'https://github.com/testuser/testrepo/issues/42',
  },
  repository: {
    id: 987654321,
    name: 'testrepo',
    full_name: 'testuser/testrepo',
    owner: {
      login: 'testuser',
      id: 12345,
      avatar_url: 'https://avatars.githubusercontent.com/u/12345',
      html_url: 'https://github.com/testuser',
      type: 'User',
    },
    html_url: 'https://github.com/testuser/testrepo',
    description: 'A test repository',
    private: false,
  },
  sender: {
    login: 'testuser',
    id: 12345,
    avatar_url: 'https://avatars.githubusercontent.com/u/12345',
    html_url: 'https://github.com/testuser',
    type: 'User',
  },
};

// Convert to JSON
const payload = JSON.stringify(mockEvent);

// Compute HMAC-SHA256 signature
const secret = 'your-webhook-secret-here';
const hmac = crypto.createHmac('sha256', secret);
hmac.update(payload, 'utf8');
const signature = 'sha256=' + hmac.digest('hex');

// Prepare request
const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhooks/github',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'X-GitHub-Event': 'issues',
    'X-Hub-Signature-256': signature,
    'User-Agent': 'GitHub-Hookshot/test',
  },
};

// Send request
const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Status:', res.statusCode);
    console.log('Response Headers:', res.headers);
    console.log('Response Body:', data);

    try {
      const json = JSON.parse(data);
      console.log('\nParsed Response:', JSON.stringify(json, null, 2));

      if (res.statusCode === 200) {
        console.log('\n✓ Webhook test successful!');
        process.exit(0);
      } else {
        console.log('\n✗ Webhook test failed');
        process.exit(1);
      }
    } catch (e) {
      console.log('\n✗ Failed to parse response as JSON');
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
  process.exit(1);
});

// Send the payload
req.write(payload);
req.end();
