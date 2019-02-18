'use strict';
const processMonitor = require('../lib/monitor/processMonitor');

function test() {
    const param = {
        pid: 56816,
        serverId: 'player1'
    };
    try {
        const data = processMonitor.getPsInfo(param);
        console.log('process information is :', data);
    }
    catch (e) {
        console.error(e);
    }
}
test();
