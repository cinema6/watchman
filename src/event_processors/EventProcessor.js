'use strict';

var ActionsReporter = require('../../lib/ActionsReporter.js');
var Q = require('q');
var ld = require('lodash');
var logger = require('cwrx/lib/logger.js');
var util = require('util');

/**
* This class is an event processor whose process method is called by a corresponding record
* processor. This class is not meant to be instantiated directly. When extending this class you
* will want to override its recordToEvent function.
*
* @class EventProcessor
* @param {String} name The name of the event processor
* @param {Object} config Configuration for the service
*/
function EventProcessor(name, config) {
    if(!name || !config) {
        throw new Error('Must provide a name and config');
    }
    this.config = config;
    this.name = name;
    this.actions = { };
    this.reporter = new ActionsReporter(config.cloudWatch);
    this.reporter.autoflush(true);
    this.loadActions();
}
EventProcessor.prototype = {
    /**
    * Called by a corresponding record processor, this method is responsible for processing a given
    * decoded record.
    *
    * @param {Object} object The json object to process.
    * @return {Promise} Resolves when the event has been processed.
    */
    process: function(object) {
        var processorConfig = this.config.eventHandlers;

        var event = this.recordToEvent(object);
        if(event && event.name && processorConfig[event.name]) {
            var eventConfig = processorConfig[event.name];
            return this.handleEvent(event, eventConfig);
        } else {
            return Q.resolve();
        }
    },

    /**
    * Handles a given event by performing its configured array of actions.
    *
    * @param {Object} event The event for which to handle. Looks like:
    *   { name: <event name>, data: <event related data> }.
    * @return {Promise} Resolves when all actions have completed. Will still resolve if some
    *   actions fail or there are no actions to be performed.
    */
    handleEvent: function(event, eventConfig) {
        var actions = eventConfig.actions || [];

        var log = logger.getLog();
        var self = this;

        // Only consider actions with event data matching regular expressions in the ifData hash
        actions = actions.filter(function(action) {
            var ifData = action.ifData || { };
            var dataKeys = Object.keys(ifData);
            for(var i=0;i<dataKeys.length;i++) {
                var key = dataKeys[i];
                var regex = new RegExp(ifData[key]);
                var dataProp = ld.get(event.data, key, null);
                if(!regex.test(dataProp)) {
                    return false;
                }
            }
            return true;
        });

        // Resolve if there are no actions in the eventConfig
        if(actions.length === 0) {
            return Q.resolve();
        }

        // Handle the event by performing its list of configured actions
        var actionNames = actions.map(function(action) {
            return action.name || action;
        });
        log.info('[%1 event processor] Event %2 performing actions %3', self.name, event.name,
            actionNames);
        return Q.allSettled(actions.map(function(action, index) {
            var actionName = actionNames[index];
            var actionModule = self.actions[actionName];
            var actionOptions = action.options || { };
            var start = Date.now();

            return Q.resolve().then(function() {
                return actionModule({ data: event.data, options: actionOptions });
            }).then(function() {
                log.trace('[%1 event processor] Successfully performed action %2',
                    self.name, actionNames[index]);
                self.reporter.pushMetricForAction(actionName, Date.now() - start);
            }).catch(function(error) {
                log.warn('[%1 event processor] Error performing action %2: %3', self.name,
                    actionName, util.inspect(error));
            });
        }));
    },

    /**
    * Maps a decoded record to an event in configuration. This method is meant to be overriden.
    *
    * @param {Object} object The json object to process.
    * @return {Object} An event object corresponding to the given json record. This object looks
    *   like { name: <event name>, data: <event related data> }.
    */
    recordToEvent: function() {
        return null;
    },

    /**
    * Returns the path to the action module given the action's name.
    *
    * @param {String} actionName The name of the action.
    * @return {String} Relative path to the named action module for use with require.
    */
    getActionPath: function(actionName) {
        return '../actions/' + actionName + '.js';
    },

    /**
    * Loads any actions that could be used by the event processor. New actions are added, existing
    * actions are updated, and actions no longer being used are deleted. CloudWatch reporters are
    * loaded and configured for any added actions. When removing actions the reporter is flushed
    * and destroyed.
    */
    loadActions: function() {
        var configuredActions = { };
        var eventHandlers = this.config.eventHandlers;
        var reportingActions = null;
        var self = this;

        // Get a list of required actions
        Object.keys(eventHandlers).forEach(function(event) {
            var eventHandler = eventHandlers[event];
            eventHandler.actions.forEach(function(action) {
                var actionName = action.name || action;
                configuredActions[actionName] = action;
            });
        });

        // Get a list of required cloudWatch reporters
        reportingActions = Object.keys(configuredActions).filter(function(actionName) {
            var actionOptions = configuredActions[actionName].options || { };
            return ('reporting' in actionOptions) ? actionOptions.reporting : true;
        });
        self.reporter.updateReportingActions(reportingActions);

        // Load the required actions
        Object.keys(configuredActions).forEach(function(actionName) {
            var modulePath = self.getActionPath(actionName);
            if(actionName in self.actions) {
                delete require.cache[require.resolve(modulePath)];
            }
            self.actions[actionName] = require(modulePath)(self.config);
        });

        // Remove unused actions
        Object.keys(self.actions).forEach(function(actionName) {
            if(!(actionName in configuredActions)) {
                var modulePath = self.getActionPath(actionName);
                delete require.cache[require.resolve(modulePath)];
                delete self.actions[actionName];
            }
        });
    }
};

module.exports = EventProcessor;
