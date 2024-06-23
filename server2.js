const express = require('express');
const fs = require('fs');
const dgram = require('dgram');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const cors = require('cors');

const app = express();
const port = 3000;
const rtpPort = 5004;
let rtpHost = '224.0.0.1'; // Default multicast address

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const sendAudioFileRTP = (filePath, host) => {
    const socket = dgram.createSocket('udp4');
    const audioData = fs.readFileSync(filePath);
    const packetSize = 160; // Typically 20ms of audio data for G.711
    let timestamp = 0;

    const sendPacket = (offset) => {
        if (offset >= audioData.length) {
            socket.close();
            return;
        }

        const payload = audioData.slice(offset, offset + packetSize);
        const rtpHeader = Buffer.alloc(12);

        rtpHeader[0] = 0x80; // Version 2
        rtpHeader[1] = 0x00; // Payload type (PCMU)
        rtpHeader.writeUInt16BE(0, 2); // Sequence number (incremented with each packet)
        rtpHeader.writeUInt32BE(timestamp, 4); // Timestamp
        rtpHeader.writeUInt32BE(0x12345678, 8); // SSRC (Synchronization Source identifier)

        const rtpPacket = Buffer.concat([rtpHeader, payload]);
        socket.send(rtpPacket, 0, rtpPacket.length, rtpPort, host, (err) => {
            if (err) {
                console.error('Error sending RTP packet:', err);
            }
        });

        timestamp += packetSize;
        setTimeout(() => sendPacket(offset + packetSize), 20); // 20ms intervals
    };

    sendPacket(0);
};

const getLocalSubnet = () => {
    const interfaces = os.networkInterfaces();
    for (let iface in interfaces) {
        for (let i = 0; i < interfaces[iface].length; i++) {
            const { family, address, internal } = interfaces[iface][i];
            if (family === 'IPv4' && !internal) {
                const subnet = address.split('.').slice(0, 3).join('.') + '.';
                return subnet;
            }
        }
    }
    throw new Error('Unable to determine local network subnet');
};

app.post('/send-audio-rtp', (req, res) => {
    const audioFilePath = path.join(__dirname, 'audio.mp3');
    const { host } = req.body;
    if (!host) {
        return res.status(400).send('RTP host is required');
    }

    try {
        sendAudioFileRTP(audioFilePath, host);
        res.json({ message: 'Audio file streaming via RTP started', host });
    } catch (error) {
        res.status(500).send(`Error sending audio file: ${error.message}`);
    }
});

app.post('/start-sniffing-all', (req, res) => {
    res.json({ message: 'Packet sniffing sessions started' });
});

app.post('/stop-sniffing', (req, res) => {
    res.json({ message: 'Packet sniffing session stopped' });
});

app.post('/stop-all-sniffing', (req, res) => {
    res.json({ message: 'All packet sniffing sessions stopped' });
});

app.get('/status', (req, res) => {
    res.json({ activeSessions: [] });
});

app.post('/network-devices', async (req, res) => {
    const { detailed = false } = req.body;  // Default to false if not provided
    console.log(detailed);
    const subnet = getLocalSubnet();
    const workerCount = os.cpus().length; // Number of workers to use
    const range = Math.ceil(254 / workerCount); // Range of IPs each worker will handle
    const promises = [];

    for (let i = 0; i < workerCount; i++) {
        const start = i * range + 1;
        const end = Math.min((i + 1) * range, 254);
        promises.push(new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'scanWorker.js'), {
                workerData: { subnet, detailed, start, end }
            });

            worker.on('message', resolve);
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        }));
    }

    try {
        const results = await Promise.all(promises);
        const activeIPs = results.flatMap(result => result.validIPs);
        const detailedInfo = results.flatMap(result => result.detailedInfo || []);
        res.json({ activeIPs, detailedInfo });
    } catch (error) {
        console.error('Error scanning network:', error);
        res.status(500).send(`Error scanning network: ${error.message}`);
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
