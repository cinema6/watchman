var CloudWatchReporter = require('cwrx/lib/cloudWatchReporter.js');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');

function ActionsReporter(cloudwatchConfig) {
    this.config = cloudwatchConfig;
    this.interval = null;
    this.reporters = { };
}
ActionsReporter.prototype = {

    // Ensures that only reporters for the given list of actions exists
    updateReportingActions: function(actionNames) {
        this.enableReportingForActions(actionNames);
        var unusedReporters = Object.keys(this.reporters).filter(function(name) {
            return (actionNames.indexOf(name) === -1);
        });
        this.disableReportingForActions(unusedReporters);
    },

    // Enables reporters for a given list of actions
    enableReportingForActions: function(actionNames) {
        var self = this;
        actionNames.filter(function(name) {
            return !(name in self.reporters);
        }).forEach(function(name) {
            self.reporters[name] = new CloudWatchReporter(self.config.namespace, {
                MetricName: name + '-Time',
                Unit: 'Milliseconds',
                Dimensions: self.config.dimensions
            }, {
                region: self.config.region
            });
        });
    },

    // Flushes and disables reporters for a given list of actions
    disableReportingForActions: function(actionNames) {
        var self = this;
        actionNames.filter(function(name) {
            return (name in self.reporters);
        }).forEach(function(name) {
            var reporter = self.reporters[name];
            reporter.flush();
            delete self.reporters[name];
        });
    },

    // Pushes metric data for an action if a reporter for it exists
    pushMetricForAction: function(actionName, metric) {
        if(actionName in this.reporters) {
            this.reporters[actionName].push(metric);
        }
    },

    // Starts or stops an autoflush for this reporter
    autoflush: function(enable) {
        var self = this;
        if(enable && !self.interval) {
            self.interval = setInterval(function() {
                self.flush();
            }, self.config.sendInterval);
        } else if(!enable && self.interval) {
            clearInterval(self.interval);
            self.flush();
        }
    },

    // Flushes data for each reporter
    flush: function() {
        var log = logger.getLog();

        ld.forEach(this.reporters, function(reporter) {
            reporter.flush();
        });
        log.info('Published CloudWatch metrics for %1 actions', ld.size(this.reporters));
    }
};
module.exports = ActionsReporter;
