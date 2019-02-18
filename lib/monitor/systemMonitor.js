'use strict';
/**
 * Module dependencies
 */

const os = require('os'),
        FormatTime = require('../util/utils').FormatTime,
        execSync = require('child_process').execSync;

const info = {};

/**
 * get information of operating-system
 *
 * @param {Function} callback
 * @api public
 */
module.exports.getSysInfo = ()=>
{
    if (process.platform === 'windows') return;
    const reData = getBasicInfo();
    try {
        const output = execSync('iostat');
        reData.iostat = format(output);
        return reData;
    }
    catch (err) {
        console.error('getSysInfo failed! ' + err.stack);
    }
};


/**
 * analysis the disk i/o data,return a map contains kb_read,kb_wrtn ect.
 *
 * @param {String} data, the output of the command 'iostat'
 * @api private
 */

function format(data) {
    const time = FormatTime(new Date());
    const output_array = data.toString().replace(/^\s+|\s+$/g,'').split(/\s+/);
    const output_values = [];
    for (let i = 0, counter = 0; i < output_array.length; i++) {
        if (!isNaN(output_array[i])) {
            output_values[counter] = parseFloat(output_array[i]);
            counter++;
        }
    }
    let output_hash = {};
    if (output_values.length > 0) {
        output_hash = {
            date: time,
            disk: {
                kb_read: output_values[9],
                kb_wrtn: output_values[10],
                kb_read_per: output_values[7],
                kb_wrtn_per: output_values[8],
                tps: output_values[6]
            },
            cpu: {
                cpu_user: output_values[0],
                cpu_nice: output_values[1],
                cpu_system: output_values[2],
                cpu_iowait: output_values[3],
                cpu_steal: output_values[4],
                cpu_idle: output_values[5]
            }
        };
        return output_hash;
    }
}

/**
 * get basic information of operating-system
 *
 * @return {Object} result
 * @api private
 */

function getBasicInfo() {
    const result = {};
    for (const key in info) {
        result[key] = info[key]();
    }
    return result;
}

info.hostname = os.hostname;

info.type = os.type;

info.platform = os.platform;

info.arch = os.arch;

info.release = os.release;

info.uptime = os.uptime;

info.loadavg = os.loadavg;

info.totalmem = os.totalmem;

info.freemem = os.freemem;

info.cpus = os.cpus;

info.networkInterfaces = os.networkInterfaces;

info.versions = function() {return process.versions;};

info.arch = function() {return process.arch;};

info.platform = function() {return process.platform;};

info.memoryUsage = process.memoryUsage;

info.uptime = process.uptime;


