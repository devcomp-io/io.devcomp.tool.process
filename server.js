
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

	var watchingAlerts = {};

	function killProcess (serviceId, pid, callback) {
		console.log("Killing process:", pid);
		delete watchingAlerts[pid];
		var cmd = "kill -9 " + pid;
		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return callback(err);
			console.log("Process killed:", pid);
			return HELPERS.sendEmail({
				subject: "Killed process: " + pid + "(" + serviceId + ")",
				text: cmd
			}, callback);
		});
	}

	function triggerAlert (serviceId, process, alertInfo, callback) {

		console.log("Service", serviceId, "and process", process, "has reached limit", alertInfo.value, "for field", alertInfo.field);

		if (!watchingAlerts[process.info.PID + "-" + alertInfo._id]) {
			console.log("Keeping an eye on process", process.info.PID, "due to", process.info[alertInfo.field]);
			watchingAlerts[process.info.PID + "-" + alertInfo._id] = process;
			return HELPERS.sendEmail({
				subject: "Keeping an eye on process: " + process.info.PID + " (" + serviceId + ") due to " + process.info[alertInfo.field],
				text: JSON.stringify(process, null, 4)
			}, callback);
		} else
		if (
			parseInt(process.info[alertInfo.field]) >
			parseInt(watchingAlerts[process.info.PID + "-" + alertInfo._id].info[alertInfo.field])
		) {
			return killProcess(serviceId, process.info.PID, function (err) {
				if (err) {
					console.error("Error killing process", process.info.PID, err.stack);
					return callback(err);
				}
				return callback(null);
			});
		}
		return callback(null);
	}

	function checkIfClearAlert (serviceId, process, alertInfo, callback) {
		if (!watchingAlerts[process.info.PID + "-" + alertInfo._id]) {
			return callback(null);
		}
		console.log("Usage went down from", watchingAlerts[process.info.PID + "-" + alertInfo._id].info[alertInfo.field], "to", process.info[alertInfo.field], ". No longer keeping eye on process", process.info.PID);
		return HELPERS.sendEmail({
			subject: "Usage went down from " + watchingAlerts[process.info.PID + "-" + alertInfo._id].info[alertInfo.field] + " to " + process.info[alertInfo.field] + " for process: " + process.info.PID + " (" + serviceId + ")",
			text: JSON.stringify(process, null, 4)
		}, function (err) {
			delete watchingAlerts[process.info.PID + "-" + alertInfo._id];
			if (err) return callback(err);
			return callback();
		});
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

				function checkProcess (process, callback) {

					var pid = process.info.PID;

					var triggered = false;

					var waitfor = HELPERS.API.WAITFOR.serial(function (err) {
						if (err) return callback(err);

						if (triggered) {
							// We don't need to process children as they should be killed automatically
							// because the parent process is gone.
							// TODO: Watch and kill all children?
							return callback(null);
						}

						var waitfor = HELPERS.API.WAITFOR.serial(callback);
						if (process.children) {
							process.children.forEach(function (pid) {
								waitfor(proceses.byPid[pid], checkProcess);
							});
						}
						return waitfor();
					});

					if (alerts[serviceId]) {
						for (var alertId in alerts[serviceId]) {
							var alertInfo = alerts[serviceId][alertId];
							alertInfo._id = alertId;
							if (alertInfo.type === "limit") {
								// Ensure process has not just started.
								if (
									process.info.TIME !== "0:00" &&
									process.info.TIME !== "0:01"
								) {
									if (parseInt(process.info[alertInfo.field]) > parseInt(alertInfo.value)) {
										triggered = true;
										waitfor(serviceId, process, alertInfo, triggerAlert);
									} else {
										waitfor(serviceId, process, alertInfo, checkIfClearAlert);
									}
								}
							}

						}
					}
					return waitfor();
				}

				var waitfor = HELPERS.API.WAITFOR.serial(callback);
				for (var serviceId in proceses.byServiceId) {
					waitfor(proceses.byPid[proceses.byServiceId[serviceId]], checkProcess);
				}
				return waitfor();
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
