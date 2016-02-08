'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');

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
            var actionModule = self.actions[actionNames[index]];
            var actionOptions = action.options || null;
            return actionModule(event.data, actionOptions, self.config);
        })).then(function(results) {
            // Log the results of each performed action
            results.forEach(function(result, index) {
                if(result.state === 'fulfilled') {
                    log.info('[%1 event processor] Successfully performed action %2',
                        self.name, actionNames[index]);
                } else {
                    var reason = result.reason;
                    log.warn('[%1 event processor] Error performing action %2: %3', self.name,
                        actionNames[index], reason);
                }
            });
        });
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
    * actions are updated, and actions no longer being used are deleted.
    */
    loadActions: function() {
        var actionNames = { };
        var eventHandlers = this.config.eventHandlers;
        var self = this;
        
        // Get a list of required actions
        Object.keys(eventHandlers).forEach(function(event) {
            var eventHandler = eventHandlers[event];
            eventHandler.actions.forEach(function(action) {
                var actionName = action.name || action;
                actionNames[actionName] = null;
            });
        });
        
        // Load the required actions
        Object.keys(actionNames).forEach(function(actionName) {
            var modulePath = self.getActionPath(actionName);
            if(actionName in self.actions) {
                delete require.cache[require.resolve(modulePath)];
            }
            self.actions[actionName] = require(modulePath);
        });
        
        // Remove unused actions
        Object.keys(self.actions).forEach(function(actionName) {
            if(!(actionName in actionNames)) {
                var modulePath = self.getActionPath(actionName);
                delete require.cache[require.resolve(modulePath)];
                delete self.actions[actionName];
            }
        });
    }
};

module.exports = EventProcessor;
