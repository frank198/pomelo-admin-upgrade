'use strict';
const Master = require('../lib/master/masterAgent');
const Monitor = require('../lib/monitor/monitorAgent');
const consoleService = require('../lib/consoleService');

const master = consoleService.createMasterConsole().agent;
const invalidPort = 8000;
let errorCount = 0;
master.on('error', function() {
    errorCount++;
});
master.listen(invalidPort, function() {
    console.log('running 8000');
});

const host = 'localhost';
const monitor = consoleService.createMonitorConsole({port:invalidPort, host:host}).agent;


errorCount = 0;


setTimeout(function() {
    monitor.connect(invalidPort, host, function(err) {
        console.lo('OK');
    });
    console.log('connect');
}, 5000);
