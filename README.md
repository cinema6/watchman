# watchman

Watchman is an event processor aimed at receiving and handling events both quickly and at scale. Watchman utilizes Amazon Kinesis to receive streams of events and event data. Utilizing a fleet of Kinesis Client Library Applications, events are processed by performing a list of actions associated with an event type. Actions are designed to be lightweight and modular so that Watchman functionality can be easily expanded, modified, and tested.

## Getting Started
- Make sure you are using the version of Node specified in the `.nvmrc` file. If you are using nvm you can do `nvm use` or if you need to install `nvm install`
- Install project dependencies with `npm install`
- Create Kinesis streams for development with `grunt streams:create`. Your username will be appended to streams which are created.
- Make sure you destroy streams when you are done developing with `grunt streams:destroy`. This will also destroy any created Dynamo tables which are a side effect of running KCL applications.
- Create a `.rcAppCreds.json` file of the form:
```
{
    "key": "WATCHMAN_DEC_APP_KEY",
    "secret": "WATCHMAN_DEV_APP_SECRET"
}
```
- Create a `.secrets.json` file of the form:
```
{
    "hubspot": {
        "key": "HUBSPOT_KEY"
    }
}
```
- Do a `berks install` or `berks update`, removing your `Berksfile.lock` file if necessary
- Bring up a Cwrx Vagrant machine
- Bring up a Vagrant machine for testing with `vagrant up`

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

module.exports = function(config) {
    return event => {
        // event.data: the data hash from the event
        // event.options: configured options for this action

        // Do stuff (usually async)
        console.log('Hello Action');

        // Must return a promise
        return Promise.resolve();
    };
};
```

## Configuring Watchman
The core watchman configuration consists of an eventHandlers property of the form:
```
{
    "eventHandlers": {
        "eventName": {
            "actions": [
                {
                    "name": "action",
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

## E2E Testing Watchman

### Using the Configurator
Every e2e test file must include a `beforeAll` dedicated to configuring each watchman application. Below is what such a `beforeAll` might look like:
```
const Configurator = require('../helpers/Configurator.js');

const PREFIX = process.env.appPrefix;

// This beforeAll is dedicated to setting application config
beforeAll(function(done) {
    const configurator = new Configurator();
    const sharedConfig = {
        // Configuration shared by every application
    };
    const cwrxConfig = {
        // Cwrx application specific config such as event handlers
        eventHandlers: { }
    };
    const timeConfig = {
        // Time application specific config such as event handlers
        eventHandlers: { }
    };
    const watchmanConfig = {
        // Watchman application specific config such as event handlers
        eventHandlers: { }
    };
    Promise.all([
        configurator.updateConfig(`${PREFIX}CwrxStreamApplication`, sharedConfig, cwrxConfig),
        configurator.updateConfig(`${PREFIX}TimeStreamApplication`, sharedConfig, timeConfig),
        configurator.updateConfig(`${PREFIX}WatchmanStreamApplication`, sharedConfig, watchmanConfig)
    ]).then(done, done.fail);
});
```
