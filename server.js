
const PATH = require("path");
const FS = require("fs");
const EXEC = require("child_process").exec;

const LIST = require("./widgets/service/list.json.service.js");


var pioConfig = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../.pio.json"), "utf8"));


require("io.pinf.server.www").for(module, __dirname, function(app, config, HELPERS) {

/*
	// Generate some dev data.
	var client = new STATSD.StatsD({
		host: '127.0.0.1',
		port: 8118,
		prefix: 'io.devcomp.tool.stats_sample_'
	});
	client.socket.on('error', function (err) {
	  return console.error("Error in socket: ", err.stack);
	});
	function recordRequest() {
		client.increment('requests');
		client.timing('response.time', 20 + Math.floor(100 * Math.random()));
		client.timing('response.time2', 20 + Math.floor(100 * Math.random()) - 10);
		setTimeout(function() {
			recordRequest();
		}, Math.random() * 1000 );
	}
	recordRequest();
*/

	function killProcess (pid, callback) {
		console.log("Killing process:", pid);
		delete watchingAlerts[process.info.PID];
		return EXEC("kill -9 " + pid, function (err, stdout, stderr) {
			if (err) return callback(err);
			console.log("Process killed:", pid);
			return callback(null);
		});
	}

	var watchingAlerts = {};

	function triggerAlert (serviceId, process, alertInfo) {

		console.log("Service", serviceId, "and process", process, "has reached limit", alertInfo.value, "for field", alertInfo.field);

		if (!watchingAlerts[process.info.PID + "-" + alertInfo._id]) {
			console.log("Keeping an eye on process", process.info.PID, "due to", process.info[alertInfo.field]);
			watchingAlerts[process.info.PID + "-" + alertInfo._id] = process;
		} else
		if (
			parseInt(process.info[alertInfo.field]) >
			parseInt(watchingAlerts[process.info.PID + "-" + alertInfo._id].info[alertInfo.field])
		) {
			killProcess(process.info.PID, function (err) {
				if (err) {
					console.error("Error killing process", process.info.PID, err.stack);
				}
			});
		}
	}

	function checkIfClearAlert (serviceId, process, alertInfo) {
		if (!watchingAlerts[process.info.PID + "-" + alertInfo._id]) {
			return;
		}
		console.log("Usage went down from", watchingAlerts[process.info.PID + "-" + alertInfo._id].info[alertInfo.field], "to", process.info[alertInfo.field], ". No longer keeping eye on process", process.info.PID);
		delete watchingAlerts[process.info.PID + "-" + alertInfo._id];
	}

	function setupAlerts (callback) {
		if (
			!config.config ||
			!config.config.alerts
		) {
			return callback(null);
		}

		var alerts = {};

		var defaultConfig = config.config.alerts['*'] || {};

		// TODO: Merge in `config.plugin` service specific config.

		pioConfig.config["pio.services"].order.forEach(function (serviceId) {
			var mergedConfig = HELPERS.API.DEEPMERGE(defaultConfig, config.config.alerts[serviceId] || {});

			console.log("Setup alert for service", serviceId, mergedConfig);

			alerts[serviceId] = mergedConfig;
		});

		function checkAlerts (callback) {

			console.log("Check alerts", (new Date()).toString());

			return LIST.getProcesses(function (err, proceses) {
				if (err) return callback(err);

				function checkProcess (process) {

					var pid = process.info.PID;

					var triggered = false;
					if (alerts[serviceId]) {
						for (var alertId in alerts[serviceId]) {
							var alertInfo = alerts[serviceId][alertId];
							alertInfo._id = alertId;
							if (alertInfo.type === "limit") {
								if (parseInt(process.info[alertInfo.field]) > parseInt(alertInfo.value)) {
									triggered = true;
									triggerAlert(serviceId, process, alertInfo);
								} else {
									checkIfClearAlert(serviceId, process, alertInfo);
								}
							}

						}
					}

					if (triggered) {
						// We don't need to process children as they should be killed automatically
						// because the parent process is gone.
						// TODO: Watch and kill all children?
						return;
					}

					if (process.children) {
						process.children.forEach(function (pid) {
							checkProcess(proceses.byPid[pid]);
						});
					}
				}

				for (var serviceId in proceses.byServiceId) {
					checkProcess(proceses.byPid[proceses.byServiceId[serviceId]]);
				}

				return callback(null);
			});
		}

		function checkAlertsInterval () {
			checkAlerts(function (err) {
				if (err) {
					console.error("Error running alert checks", err.stack);
				}
			});
		}
		setInterval(checkAlertsInterval, 60 * 1000);
		checkAlertsInterval();

		return callback(null);
	}

	setupAlerts(function (err) {
		if (err) {
			console.error("Error setting up alerts", err.stack);
		}
	});

});
