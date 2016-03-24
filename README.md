# watchman

Watchman is an event processor aimed at receiving and handling events both quickly and at scale. Watchman utilizes Amazon Kinesis to receive streams of events and event data. Utilizing a fleet of Kinesis Client Library Applications, events are processed by performing a list of actions associated with an event type. Actions are designed to be lightweight and modular so that Watchman functionality can be easily expanded, modified, and tested.

## Getting Started
```
npm install          # Install project dependencies
grunt streams:create # Create test streams for development
vagrant up           # Bring up a Vagrant machine for testing
```

## Record Processor
The record processor processes data from an Amazon Kinesis stream. It implements the interface defined by the aws-kcl package which handles commication with the Kinesis MultiLangDaemon. Records which arrive through a stream are parsed as JSON and are typically of the form:
```
{
    "type": "event",
    "data": {
        "foo": "bar"
    }
}
```

## Event Processor
The event processor is called upon by the record processor. The event processor is what interprets the record that has arrived through a stream as an event. An event is typically of the form:
```
{
    "name": "event",
    "data": {
        "foo": "bar"
    }
}
```

## Actions
An action is a module which is loaded and executed by the event processor. Actions are designed to be lightweight and modular. An action is typically of the form:
```
'use strict';

var Q = require('q');

module.exports = function(data, options, config) {
    // data: the data hash from the event
    // options: configured options for this action
    // config: watchman configuration object

    // Do stuff (usually async)
    console.log('Hello Action');

    // Must return a promise
    return Q.resolve();
}
```

## Configuring Watchman
The core watchman configuration consists of an eventHandlers property of the form:
```
{
    "eventHandlers": {
        "eventName1": {
            "actions": ["action1", "action2"]
        },
        "eventName2": {
            "actions": [
                {
                    "name": "action3",
                    "options": {
                        "foo": "bar"
                    },
                    "ifData": {
                        "baz": "^regex"
                    }
                }
            ]
        }
    }
}
```
The eventHandlers object contains as keys a list of event names to handle. Each of these must be an Object with an actions property set to a non-empty array of values. Entries in this array may be a string if you want to simply specify the action name to be performed. If you need to further configure an action, you may pass an object which supports the name, options, and ifData properties.
* name - The action name
* options - An object containing options supported by the action
* ifData - An object containing keys corresponding to event data. The action will only by performed **IF** the data matches the specified regular expression
