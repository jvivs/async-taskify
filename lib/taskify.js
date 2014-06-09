var _ = require('underscore');

var extractDependencies = function (fn) {
	var reExtractArgs = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
	var signature = fn.toString().split('\n')[0];
	return _.map(signature.match(reExtractArgs)[1].split(','), function (arg) {
		return arg.trim();
	});
};

var dependencyResolver = function (dependencies) {
	var callbackIndex = dependencies.indexOf('callback');
	var deps = _.without(dependencies, 'callback'); // filter out callbacks and errors
	var resolver = function (results) {
		return _.chain(deps).groupBy(function (dep) {
			return typeof results[dep] === 'undefined'
				? 'unresolved'
				: 'resolved';
		}).extend({
			callback: callbackIndex
		}).value();
	};

	if (callbackIndex !== -1) {
		resolver.callback = callbackIndex;
	}

	return resolver;
};

var taskify = function (step) {
	var deps = extractDependencies(step);
	var resolver = dependencyResolver(deps);
	/* returns a fn that when called with fn(results), returns:
		{
			'resovled': // list of resolved dependencies
			'unresovled': // list of unresolved dependencies
			'callback': // position of callback in arguments
		}
	 */
	var task;

	/*
	// no args
		var synchronousValue = function () {
			return 'something';
		}
		// should return a task like this:
		var synchronousValueTask = function (callback) {
			process.nextTick(function () {
				callback(null, synchronousValue());
			});
		}
	*/
	if (deps.length === 0) { // no dependencies, so assume synchronous

		task = function (callback) {
			process.nextTick(function () {
				callback(null, step); // TODO: would we need this process.nextTick to ensure consistency in api?
			});
		}

	} else if (resolver.callback === 0 && deps.length === 1) {
		// first argument is a callback, assume that's the only argument because (callback, err) is an anti-pattern like woah
		/* // only callback
			 var asyncValue = function (callback) {
			 // do stuff where you pass a callback
			    API.get.stuff(callback);
			 }
			 // should return a task like this:
			 var asyncValueTask = asyncValue;
		 */
		task = step;
	} else {

		/*
		 // arguments w/o callback
		 var synchronousProcess = function (arg1, arg2, arg3) {
		 }
		 // should return a task like this:
		 var synchronousProcessTask = function (callback, results) {
		 var args = _.map(['arg1', 'arg2', 'arg3'], function (argName) {
		 return results[argName];
		 };
		 process.nextTick(function () {
		 callback(null, synchronousProcess.apply(null, args));
		 });
		 }
		 */

		/*
			 // args w/ callback
			 var asyncProcess = function (arg1, arg2, arg3, callback) {
			 // do stuff w/ args
			 callback(err, result);
			 }
			 // should return a task like this:
			 var asyncProcessTask = function (callback, results) {
			 var args = _.map(['arg1', 'arg2', 'arg3'], function (argName) {
			 return results[argName];
			 };
			 asyncProcess.apply(null, args.concat(callback));
			 }
		 */



		task = _.without(deps, 'callback').concat(function (callback, results) {
			var depValues = resolver(results);

			if (depValues.unresolved && depValues.unresolved.length > 0) {
				callback(new Error('[async.taskify] task requires the resolution of the following values: %s', depValues.unresolved.join(', ')));
			} else {
				if (resolver.callback === -1) {
					// no callback, so collect argument values by name and pass back to async.auto
					process.nextTick(function () { // TODO: would we need this process.nextTick to ensure consistency in api?
						callback(null, step.apply(null, depValues.resolved));
					});
				} else {
					// already checked that callback index is > 0 and not -1, so there are arguments and the callback is not the only one
					step.apply(null, depValues.resolved.concat(callback));
				}
			}
		});
	}
	return task;
};

module.exports = {
	taskify: taskify
};