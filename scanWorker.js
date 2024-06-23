const { parentPort, workerData } = require('worker_threads');
const ping = require('net-ping');
const arp = require('node-arp');
const Nmap = require('node-nmap');

// Function to ping a host with a timeout
const pingHost = (session, target) => {
    return new Promise((resolve) => {
        session.pingHost(target, { timeout: 2000 }, (error, target) => {
            if (error) {
                resolve(null);
            } else {
                resolve(target);
            }
        });
    });
};

// Function to get device details with a timeout for Nmap scan
const getDeviceDetails = (ip) => {
    return new Promise((resolve) => {
        arp.getMAC(ip, (err, mac) => {
            if (err) {
                console.error(`ARP error for IP ${ip}:`, err);
                return resolve({ ip, mac: 'N/A' });
            }

            Nmap.nmapLocation = "nmap"; // default
            const scan = new Nmap.NmapScan(ip, '-A --host-timeout 10s');

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

// Function to scan the network with limited concurrency
const scanNetwork = async (subnet, detailed, start, end) => {
    try {
        const session = ping.createSession();
        const pingPromises = [];
        for (let i = start; i <= end; i++) {
            pingPromises.push(pingHost(session, `${subnet}${i}`));
        }

        const pingResults = await Promise.all(pingPromises);
        const validIPs = pingResults.filter(ip => ip !== null);

        if (detailed) {
            const detailResults = [];
            for (let i = 0; i < validIPs.length; i += 50) {
                const detailBatch = validIPs.slice(i, i + 50).map(ip => getDeviceDetails(ip));
                const batchResults = await Promise.all(detailBatch);
                detailResults.push(...batchResults);
            }
            return { validIPs, detailedInfo: detailResults };
        } else {
            return { validIPs };
        }
    } catch (error) {
        console.error('Error scanning network:', error);
        throw error;
    }
};

scanNetwork(workerData.subnet, workerData.detailed, workerData.start, workerData.end)
    .then(result => parentPort.postMessage(result))
    .catch(error => parentPort.postMessage({ error: error.message }));
