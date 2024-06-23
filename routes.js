const express = require('express');
const fs = require('fs');
const path = require('path');
const Cap = require('cap').Cap;
const decoders = require('cap').decoders;
const PROTOCOL = decoders.PROTOCOL;
const raw = require('raw-socket');
const { WebSocketServer } = require('ws');
const ping = require('net-ping'); // Add the ping module import
const { exec } = require('child_process');

const {getLocalSubnet , sendAudioFileRTP, getDeviceDetails, pingHost} = require("./functions")
const router = express.Router();
let capSessions = {};
let rawSockets = {};
let wss = null;
const clients = new Map();

const startWebSocketServer = (server) => {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        const id = Date.now();
        clients.set(id, ws);
        console.log(`Client connected: ${id}`);

        ws.on('close', () => {
            clients.delete(id);
            console.log(`Client disconnected: ${id}`);
        });
    });
};

// Helper function to send audio file
const sendAudioFile = (sessionId, ipAddress) => {
    const audioFilePath = path.join(__dirname, 'audio.mp3');
    const audioData = fs.readFileSync(audioFilePath);
    const packetSize = 1024; // Adjust the packet size as needed
    let offset = 0;

    while (offset < audioData.length) {
        const chunk = audioData.slice(offset, offset + packetSize);
        rawSockets[sessionId].send(chunk, 0, chunk.length, ipAddress, (error, bytes) => {
            if (error) {
                console.error('Error sending audio packet:', error);
            } else {
                console.log('Audio packet sent, bytes:', bytes);
            }
        });
        offset += packetSize;
    }
};

const startSniffingSession = (device, filter, sessionId) => {
    const cap = new Cap();
    const buffer = Buffer.alloc(65535);

    capSessions[sessionId] = cap;
    rawSockets[sessionId] = raw.createSocket({ protocol: raw.Protocol.None });

    console.log(`Listening on ${device.name} with session ID: ${sessionId}`);

    cap.open(device.name, filter, 10 * 1024 * 1024, buffer);

    cap.on('packet', (nbytes, trunc) => {
        const ret = decoders.Ethernet(buffer);

        if (ret.info.type === PROTOCOL.ETHERNET.IPV4) {
            const ipv4 = decoders.IPV4(buffer, ret.offset);
            let payload = null;

            if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
                const tcp = decoders.TCP(buffer, ipv4.offset);
                const payloadOffset = ipv4.offset + tcp.hdrlen;
                payload = buffer.slice(payloadOffset, ipv4.offset + ipv4.info.totallen);
            } else if (ipv4.info.protocol === PROTOCOL.IP.UDP) {
                const udp = decoders.UDP(buffer, ipv4.offset);
                const payloadOffset = ipv4.offset + udp.hdrlen;
                payload = buffer.slice(payloadOffset, ipv4.offset + ipv4.info.totallen);
            }

            const packetInfo = {
                length: nbytes,
                truncated: trunc,
                from: ipv4.info.srcaddr,
                to: ipv4.info.dstaddr,
                payload: payload ? payload.toString('hex') : 'N/A'
            };

            clients.forEach((ws) => {
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify(packetInfo));
                }
            });

            if (ipv4.info.protocol === PROTOCOL.IP.TCP) {
                const tcp = decoders.TCP(buffer, ipv4.offset);
                const craftedPacket = Buffer.from('your raw packet data here');
                rawSockets[sessionId].send(craftedPacket, 0, craftedPacket.length, ipv4.info.dstaddr, (error, bytes) => {
                    if (error) {
                        console.error('Error sending packet:', error);
                    } else {
                        console.log('Injected packet sent, bytes:', bytes);
                    }
                });
            }
        }
    });

    return { sessionId, device: device.name, filter };
};


router.post('/start-sniffing', (req, res) => {
    const filter = req.body.filter || '';
    const devices = Cap.deviceList();
    let startedSessions = [];

    devices.forEach(device => {
        try {
            const sessionId = `${device.name}-${Date.now()}`;
            const sessionInfo = startSniffingSession(device, filter, sessionId);
            startedSessions.push(sessionInfo);
        } catch (error) {
            console.error(`Error starting session for device ${device.name}: ${error.message}`);
        }
    });

    if (startedSessions.length === 0) {
        return res.status(500).send('No packet sniffing sessions could be started');
    }

    res.json({ message: 'Packet sniffing sessions started', startedSessions });
});

router.post('/start-sniffing-all', (req, res) => {
    const devices = Cap.deviceList();
    let startedSessions = [];

    devices.forEach(device => {
        try {
            const sessionId = `${device.name}-${Date.now()}`;
            const sessionInfo = startSniffingSession(device, '', sessionId);
            startedSessions.push(sessionInfo);
        } catch (error) {
            console.error(`Error starting session for device ${device.name}: ${error.message}`);
        }
    });

    if (startedSessions.length === 0) {
        return res.status(500).send('No packet sniffing sessions could be started');
    }

    res.json({ message: 'Packet sniffing sessions started', startedSessions });
});

router.post('/send-audio', (req, res) => {
    const { sessionId, ipAddress } = req.body;

    if (!sessionId || !capSessions[sessionId]) {
        return res.status(400).send('Invalid session ID');
    }

    if (!ipAddress) {
        return res.status(400).send('IP address is required');
    }

    try {
        sendAudioFile(sessionId, ipAddress);
        res.json({ message: 'Audio file sent', sessionId, ipAddress });
    } catch (error) {
        res.status(500).send(`Error sending audio file: ${error.message}`);
    }
});

router.post('/stop-sniffing', (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId || !capSessions[sessionId]) {
        return res.status(400).send('Invalid session ID');
    }

    try {
        capSessions[sessionId].close();
        rawSockets[sessionId].close();
        delete capSessions[sessionId];
        delete rawSockets[sessionId];
        res.json({ message: 'Packet sniffing session stopped', sessionId });
    } catch (error) {
        res.status(500).send(`Error stopping packet sniffing session: ${error.message}`);
    }
});

router.post('/stop-all-sniffing', (req, res) => {
    Object.keys(capSessions).forEach(sessionId => {
        try {
            capSessions[sessionId].close();
            rawSockets[sessionId].close();
            delete capSessions[sessionId];
            delete rawSockets[sessionId];
        } catch (error) {
            console.error(`Error stopping session ${sessionId}: ${error.message}`);
        }
    });

    res.json({ message: 'All packet sniffing sessions stopped' });
});

router.get('/status', (req, res) => {
    const activeSessions = Object.keys(capSessions).map(sessionId => {
        const session = capSessions[sessionId];
        return {
            sessionId,
            device: session.device,
            filter: session.filter || 'None'
        };
    });

    res.json({ activeSessions });
});

// Route to get IP addresses of all devices on the network
router.post('/network-devices', async (req, res) => {
    const { detailed = false } = req.body;
    const session = ping.createSession();
    const subnet = getLocalSubnet();
    const activeIPs = [];

    const pingPromises = [];
    for (let i = 1; i <= 254; i++) {
        pingPromises.push(pingHost(session, subnet + i));
    }

    const pingResults = await Promise.all(pingPromises);
    const validIPs = pingResults.filter(ip => ip !== null);

    if (detailed) {
        const detailPromises = validIPs.map(ip => getDeviceDetails(ip));
        const detailResults = await Promise.all(detailPromises);
        res.json({ activeIPs: validIPs, detailedInfo: detailResults });
    } else {
        res.json({ activeIPs: validIPs });
    }
});

// Route to get detailed information for a single IP address
router.post('/network-device-details', async (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).send('IP address is required');
    }

    try {
        const details = await getDeviceDetails(ip);
        res.json(details);
    } catch (error) {
        res.status(500).send(`Error getting device details: ${error.message}`);
    }
});

// Route to send a message to a device
router.post('/send-message', (req, res) => {
    const { ip, port, message } = req.body;
    if (!ip || !port || !message) {
        return res.status(400).send('IP address, port, and message are required');
    }

    const client = new dgram.Socket();
    const messageBuffer = Buffer.from(message);

    client.send(messageBuffer, port, ip, (err) => {
        client.close();
        if (err) {
            return res.status(500).send(`Error sending message: ${err.message}`);
        }
        res.json({ message: 'Message sent successfully' });
    });
});

// Route to send packets to a device
router.post('/send-packet', (req, res) => {
    const { ip, data } = req.body;
    if (!ip || !data) {
        return res.status(400).send('IP address and data are required');
    }

    const client = new dgram.Socket();
    const dataBuffer = Buffer.from(data, 'hex');

    client.send(dataBuffer, 0, dataBuffer.length, 0, ip, (err) => {
        client.close();
        if (err) {
            return res.status(500).send(`Error sending packet: ${err.message}`);
        }
        res.json({ message: 'Packet sent successfully' });
    });
});

// Route to list open ports of a device
router.post('/list-ports', async (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).send('IP address is required');
    }

    try {
        const details = await getDeviceDetails(ip);
        res.json({ ip, ports: details.ports });
    } catch (error) {
        res.status(500).send(`Error getting device ports: ${error.message}`);
    }
});

// Route to shutdown a device
const shutdownWindowsDevice = (ip) => {
    return new Promise((resolve, reject) => {
        wmi.Query({
            host: ip,
            namespace: 'root\\cimv2',
            class: 'Win32_OperatingSystem'
        }, function(err, result) {
            if (err) {
                return reject(`Error querying WMI: ${err}`);
            }
            const os = result[0];
            wmi.ExecMethod({
                host: ip,
                path: os.__PATH,
                method: 'Win32Shutdown',
                params: [1] // 1 = Shutdown, 2 = Reboot
            }, function(err) {
                if (err) {
                    return reject(`Error executing WMI method: ${err}`);
                }
                resolve('Shutdown command sent successfully');
            });
        });
    });
};

// Function to reboot a Windows device using WMI
const rebootWindowsDevice = (ip) => {
    return new Promise((resolve, reject) => {
        wmi.Query({
            host: ip,
            namespace: 'root\\cimv2',
            class: 'Win32_OperatingSystem'
        }, function(err, result) {
            if (err) {
                return reject(`Error querying WMI: ${err}`);
            }
            const os = result[0];
            wmi.ExecMethod({
                host: ip,
                path: os.__PATH,
                method: 'Win32Shutdown',
                params: [2] // 1 = Shutdown, 2 = Reboot
            }, function(err) {
                if (err) {
                    return reject(`Error executing WMI method: ${err}`);
                }
                resolve('Reboot command sent successfully');
            });
        });
    });
};

const wmi = require('node-wmi');

// Route to shutdown a device
router.post('/shutdown-device', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }

    shutdownWindowsDevice(ip)
        .then(message => res.json({ message }))
        .catch(error => res.status(500).json({ error }));
});

// Route to reboot a device
router.post('/reboot-device', (req, res) => {
    const { ip } = req.body;
    if (!ip) {
        return res.status(400).json({ error: 'IP address is required' });
    }

    rebootWindowsDevice(ip)
        .then(message => res.json({ message }))
        .catch(error => res.status(500).json({ error }));
});

module.exports = { router, startWebSocketServer };
