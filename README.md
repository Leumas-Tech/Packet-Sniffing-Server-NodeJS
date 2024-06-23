# Packet Sniffing Server NodeJS

This project is a network packet sniffing server implemented in NodeJS. It allows users to scan the network, start and stop packet sniffing sessions, and get detailed information about the devices on the network.

## How to Download and Start Using the App

1. **Clone the repository**:
    ```sh
    git clone https://github.com/Leumas-Tech/Packet-Sniffing-Server-NodeJS.git
    ```

2. **Navigate into the project directory**:
    ```sh
    cd Packet-Sniffing-Server-NodeJS
    ```

3. **Install the dependencies**:
    ```sh
    npm install
    ```

4. **Start the server**:
    ```sh
    node server.js
    ```

5. **Open your browser and navigate to** `http://localhost:3000` to use the network scanner and packet sniffer.

## Available Routes

- **POST /start-sniffing**: Start sniffing packets for a specific IP with a given filter.
- **POST /start-sniffing-all**: Start sniffing packets on all network devices.
- **POST /stop-sniffing**: Stop a specific packet sniffing session.
- **POST /stop-all-sniffing**: Stop all packet sniffing sessions.
- **GET /status**: Get the status of active packet sniffing sessions.
- **POST /network-devices**: Get IP addresses of all devices on the network (detailed or non-detailed).
- **POST /network-device-details**: Get detailed information for a single IP address.
- **POST /send-audio**: Send an audio file to a device via RTP.
- **POST /shutdown-device**: Shutdown a device.
- **POST /reboot-device**: Reboot a device.
- **POST /send-message**: Send a message to a device.
- **POST /send-packet**: Send a packet to a device.
- **POST /list-ports**: List open ports of a device.

## Features in the UI

- **Network Scanning**:
  - Scan the network for active devices.
  - Perform a detailed scan to get more information about each device.

- **Packet Sniffing**:
  - Start and stop packet sniffing sessions.
  - View real-time packet data with timestamp, source, destination, length, and payload.

- **Device Management**:
  - Shutdown or reboot devices from the UI.
  - List open ports for a specific device.

- **Session Management**:
  - Paginate between different packet sniffing sessions.
  - Clear packet data in the current session.

## License

This project is licensed under the MIT License.
