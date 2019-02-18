'use strict';
const systemMonitor = require('../lib/monitor/systemMonitor');

function test() {
    const sysData = systemMonitor.getSysInfo();
    console.log('operating-system information is: ', sysData);
}

test();
