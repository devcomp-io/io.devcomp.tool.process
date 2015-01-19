
const PATH = require("path");
const FS = require("fs");
const EXEC = require("child_process").exec;


var pioConfig = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../../../.pio.json"), "utf8"));


exports.app = function (req, res, next) {

	if (req.body.action === "start") {

		console.log("Starting app", req.body.serviceId);

		var cmd = "sudo start app-" + req.body.serviceId.replace(/\./g, "-");

		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return next(err);

			console.log("stdout", stdout);
			console.log("stderr", stderr);

			return res.sendEmail({
				subject: "[" + pioConfig.config["pio"].hostname + "] manually started app: " + req.body.serviceId,
				text: cmd
			}, function (err) {
				if (err) return next(err);

				return res.end("{}");
			});
		});

	} else
	if (req.body.action === "stop") {

		console.log("Stopping app", req.body.serviceId);

		var cmd = "sudo stop app-" + req.body.serviceId.replace(/\./g, "-");

		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return next(err);

			console.log("stdout", stdout);
			console.log("stderr", stderr);

			return res.sendEmail({
				subject: "[" + pioConfig.config["pio"].hostname + "] manually stopped app: " + req.body.serviceId,
				text: cmd
			}, function (err) {
				if (err) return next(err);

				return res.end("{}");
			});
		});

	} else
	if (req.body.action === "restart") {

		console.log("Restarting app", req.body.serviceId);

		var cmd = "sudo restart app-" + req.body.serviceId.replace(/\./g, "-");

		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return next(err);

			console.log("stdout", stdout);
			console.log("stderr", stderr);

			return res.sendEmail({
				subject: "[" + pioConfig.config["pio"].hostname + "] manually restarted app: " + req.body.serviceId,
				text: cmd
			}, function (err) {
				if (err) return next(err);

				return res.end("{}");
			});
		});

	} else
	if (req.body.action === "kill") {

		console.log("Kill process", req.body.pid);

		var cmd = "kill " + req.body.pid;

		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return next(err);

			console.log("stdout", stdout);
			console.log("stderr", stderr);

			return res.sendEmail({
				subject: "[" + pioConfig.config["pio"].hostname + "] manually killed process: " + req.body.pid,
				text: cmd
			}, function (err) {
				if (err) return next(err);

				return res.end("{}");
			});
		});

	} else
	if (req.body.action === "terminate") {

		console.log("Terminate process", req.body.pid);

		var cmd = "kill -9 " + req.body.pid;
		return EXEC(cmd, function (err, stdout, stderr) {
			if (err) return next(err);

			console.log("stdout", stdout);
			console.log("stderr", stderr);

			return res.sendEmail({
				subject: "[" + pioConfig.config["pio"].hostname + "] manually terminated process: " + req.body.pid,
				text: cmd
			}, function (err) {
				if (err) return next(err);

				return res.end("{}");
			});
		});

	} else {
		return next(new Error("Action '" + req.body.action + "' not supported!"));		
	}

	return res.end();
}
