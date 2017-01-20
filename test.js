/**
 * Created by Administrator on 2016/12/9 0009.
 */

var Master = require('./lib/master/masterAgent');
var Monitor = require('./lib/monitor/monitorAgent');
var consoleService = require('./lib/consoleService');

var master = consoleService.createMasterConsole().agent;
var invalidPort = 8000;
var errorCount = 0;
master.on('error', function() {
    errorCount++;
});
master.listen(invalidPort, function () {
    console.log("running 8000")
});

var host = 'localhost';
var monitor = consoleService.createMonitorConsole({port:invalidPort, host:host}).agent;


var errorCount = 0;


setTimeout(function() {
    monitor.connect(invalidPort, host, function(err) {
        console.lo("OK")
    });
    console.log("connect")
}, 5000);
