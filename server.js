const express = require('express');
const path = require('path');
const cors = require('cors');
const { router, startWebSocketServer } = require('./routes');

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/', router);

const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    startWebSocketServer(server);
});
