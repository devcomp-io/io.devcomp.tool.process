
const PATH = require("path");
const FS = require("fs");
const EXEC = require("child_process").exec;
const SPAWN = require("child_process").spawn;


var pioConfig = JSON.parse(FS.readFileSync(PATH.join(__dirname, "../../../.pio.json"), "utf8"));


exports.app = function (req, res, next) {

	function getProcesses (callback) {

		var processes = {
			byPid: {},
			byServiceId: {}
		};
		var columns;

		function makeRow (columns, fields) {
			var row = {};
			fields.forEach(function (field, index) {
				if (columns[index]) {
					row[columns[index]] = field;
				} else {
					row[columns[columns.length - 1]] += " " + field;
				}
			});
			return row;
		}


		var proc = SPAWN("bash");
		proc.stderr.on('data', function (data) {
		  console.log('stderr: ' + data);
		});
		var buffer = [];
		proc.stdout.on('data', function (data) {
			buffer.push(data.toString());
		});
		proc.on('close', function (code) {
			if (code !== 0) {
				return callback(new Error("Process exit status != 0"));
			}
			columns = null;
			buffer.join("").split("\n").forEach(function (line) {
				if (!line) return;
				var fields = line.replace(/[\t\s]+/g, " ").replace(/(^\s|\s$)/g, "").split(/\s/);

				if (fields[0] === "PPID" || fields[0] === "USER") {
					columns = fields;
				} else {
					// @see http://www.cs.miami.edu/~geoff/Courses/CSC521-04F/Content/UNIXProgramming/UNIXProcesses.shtml
					// @see http://chinkisingh.com/2012/06/10/session-foreground-processes-background-processes-and-their-interaction-with-controlling-terminal/					
					var process = makeRow(columns, fields);
					// process.PID - Process ID
					// process.PPID - Parent process ID
					// process.PGID - Parent group ID
					// process.SID - Session leader ID
					// process.TPGID - Terminal process group ID
					// process.TTY - (TeleTYpewriter) The terminal that executed a particular command ; @see http://stackoverflow.com/a/7113800/330439
					// process.STAT - Process state ; @see http://unix.stackexchange.com/a/18477/92833
					//	 states:
					//		D Uninterruptible sleep (usually IO)
					//		R Running or runnable (on run queue)
					//		S Interruptible sleep (waiting for an event to complete)
					//		T Stopped, either by a job control signal or because it is being traced.
					//		W paging (not valid since the 2.6.xx kernel)
					//		X dead (should never be seen)
					//		Z Defunct ("zombie") process, terminated but not reaped by its parent.
					//   flags:
					//		< high-priority (not nice to other users)
					//		N low-priority (nice to other users)
					//		L has pages locked into memory (for real-time and custom IO)
					//		s is a session leader
					//		l is multi-threaded (using CLONE_THREAD, like NPTL pthreads do)
					//		+ is in the foreground process group
					// process.UID - User ID ; @see http://stackoverflow.com/a/205146/330439
					// process.START - Indication of how long the process has been up
					// process.TIME - Accumulated CPU utilization time ; @see http://www.theunixschool.com/2012/09/ps-command-what-does-time-indicate.html
					// process.USER - Username of PID
					// process.COMMAND - The command being executed
					// process.%CPU - % of current total CPU utilization
					// process.%MEM - % of current total MEM utilization
					// process.VSZ - (Virtual Memory Size) Accessible memory including swap and shared lib ; @see http://stackoverflow.com/a/21049737/330439
					// process.RSS - (Resident Set Size) Allocated ram ; @see http://stackoverflow.com/a/21049737/330439

					if (!processes.byPid[process.PID]) {
						processes.byPid[process.PID] = {};
					}
					if (!processes.byPid[process.PID].info) {
						processes.byPid[process.PID].info = {};
					}
					for (var name in process) {
						if (typeof processes.byPid[process.PID].info[name] === "undefined") {
							processes.byPid[process.PID].info[name] = process[name];
						}
					}

					if (process.COMMAND) {
						var m = process.COMMAND.match(/\s\/opt\/run\/([^\/]+).pid.+UPSTART_JOB/);
						if (m) {
							processes.byServiceId[m[1]] = process.PID;
						}
					}

					if (process.PPID) {
						if (!processes.byPid[process.PPID]) {
							processes.byPid[process.PPID] = {};
						}
						if (!processes.byPid[process.PPID].children) {
							processes.byPid[process.PPID].children = [];
						}
						if (processes.byPid[process.PPID].children.indexOf(process.PID) === -1) {
							processes.byPid[process.PPID].children.push(process.PID);
						}
					}

				}
			});

			return callback(null, processes)
		});
		proc.stdin.write("ps axwwejH ; ps axuww");
		return proc.stdin.end();
	}

	return getProcesses(function (err, proceses) {
		if (err) return next(err);

		var data = {
			services: {},
			processes: proceses.byPid
		};

		pioConfig.config["pio.services"].order.forEach(function (serviceId) {
			data.services[serviceId] = (proceses.byServiceId[serviceId] && proceses.byPid[proceses.byServiceId[serviceId]]) || {};
			data.services[serviceId].group = pioConfig.config["pio.services"].services[serviceId].group;
		});

		function respond(body) {
			res.writeHead(200, {
				"Content-Type": "application/json",
				"Content-Length": body.length,
				"Cache-Control": "max-age=5"  // seconds
			});
		    return res.end(body);
		}

		return respond(JSON.stringify(data, null, 4));
	});
}

