const fs = require('fs');
const dgram = require('dgram');
const os = require('os');
const arp = require('node-arp');
const Nmap = require('node-nmap');
const ping = require('net-ping');

const sendAudioFileRTP = (filePath, host) => {
    const socket = dgram.createSocket('udp4');
    const audioData = fs.readFileSync(filePath);
    const packetSize = 160;
    let timestamp = 0;

    const sendPacket = (offset) => {
        if (offset >= audioData.length) {
            socket.close();
            return;
        }

        const payload = audioData.slice(offset, offset + packetSize);
        const rtpHeader = Buffer.alloc(12);

        rtpHeader[0] = 0x80;
        rtpHeader[1] = 0x00;
        rtpHeader.writeUInt16BE(0, 2);
        rtpHeader.writeUInt32BE(timestamp, 4);
        rtpHeader.writeUInt32BE(0x12345678, 8);

        const rtpPacket = Buffer.concat([rtpHeader, payload]);
        socket.send(rtpPacket, 0, rtpPacket.length, 5004, host, (err) => {
            if (err) {
                console.error('Error sending RTP packet:', err);
            }
        });

        timestamp += packetSize;
        setTimeout(() => sendPacket(offset + packetSize), 20);
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

const getDeviceDetails = (ip) => {
    return new Promise((resolve) => {
        arp.getMAC(ip, (err, mac) => {
            if (err) {
                console.error(`ARP error for IP ${ip}:`, err);
                return resolve({ ip, mac: 'N/A' });
            }

            Nmap.nmapLocation = "nmap";
            const scan = new Nmap.NmapScan(ip, '-A');

            scan.on('complete', (data) => {
                if (data.length > 0) {
                    const deviceInfo = {
                        ip,
                        mac,
                        hostnames: data[0].hostnames,
                        ports: data[0].openPorts,
                        osNmap: data[0].osNmap,
                        os: data[0].os,
                    };
                    resolve(deviceInfo);
                } else {
                    resolve({ ip, mac, error: 'Nmap scan returned no data' });
                }
            });

            scan.on('error', (error) => {
                console.error(`Nmap error for IP ${ip}:`, error);
                resolve({ ip, mac, error: 'Nmap scan failed' });
            });

            scan.startScan();
        });
    });
};

const pingHost = (session, target) => {
    return new Promise((resolve) => {
        session.pingHost(target, (error, target) => {
            if (error) {
                resolve(null);
            } else {
                resolve(target);
            }
        });
    });
};

module.exports = {
    sendAudioFileRTP,
    getLocalSubnet,
    getDeviceDetails,
    pingHost,
};
