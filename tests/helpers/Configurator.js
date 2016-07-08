'use strict';

/*
* This helper class provides methods useful for modifying the configuration of KCL applications on
* a running Watchman instance. Because these methods alter configuration files on a live instance
* they should be used with care. They are intended to be used in a beforeAll in e2e test specs.
* Typically only the updateConfig method should be used.
*/

const fs = require('fs');
const ld = require('lodash');
const path = require('path');
const childProcess = require('child_process');
const uuid = require('rc-uuid');

class ExecutionError extends Error {
    constructor(command, code, errors) {
        super(`${command} exited with code ${code} and errors ${errors}`);

        this.command = command;
        this.code = code;
        this.errors = errors;
    }
}

// Helper for managing watchman application config files
module.exports =  class Configurator {
    constructor(options) {
        const opts = { };
        ld.defaults(opts, options, {
            host: process.env.watchmanHost,
            tmpDir: path.resolve('.'),
            key: path.resolve(process.env.HOME, '.vagrant.d/insecure_private_key'),
            user: 'vagrant',
            configPath: '/opt/sixxy/conf'
        });
        this.opts = opts;
    }

    // Deletes a file
    unlinkFile(file) {
        return new Promise((resolve, reject) => {
            fs.unlink(file, error => {
                if(error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    // Reads a file
    readFile(file) {
        return new Promise((resolve, reject) => {
            fs.readFile(file, {
                encoding: 'utf-8'
            }, (error, data) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(data);
                }
            });
        });
    }

    // Writes a file with given data
    writeFile(file, data) {
        return new Promise((resolve, reject) => {
            fs.writeFile(file, data, {
                encoding: 'utf-8'
            }, error => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    // Executes the given command with the provided list of arguments
    execute(command, args) {
        const cmd = childProcess.spawn(command, args, {
            cwd: this.opts.tmpDir
        });

        return new Promise((resolve, reject) => {
            const errors = [];
            cmd.stderr.on('data', data => errors.push(data));
            cmd.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new ExecutionError(command, code, errors));
                }
            });
        });
    }

    // Reads the configuration for a given application and returns it as an Object
    getConfig(application) {
        const appConfigPath = path.resolve(this.opts.configPath, `${application}.json`);
        const savePath = path.resolve(this.opts.tmpDir, `${uuid.createUuid()}.json`);
        const args = ['-i', this.opts.key, `${this.opts.user}@${this.opts.host}:${appConfigPath}`, savePath];

        return this.execute('scp', args).then(() => {
            return this.readFile(savePath).then(data => {
                return this.unlinkFile(savePath).then(() => {
                    return JSON.parse(data);
                });
            });
        });
    }

    // Writes the given config Object for the given application to the corresponding config file
    setConfig(application, config) {
        const appConfigPath = path.resolve(this.opts.configPath, `${application}.json`);
        const fileName = `${uuid.createUuid()}.json`;
        const savePath = path.resolve(this.opts.tmpDir, fileName);
        const scpArgs = ['-i', this.opts.key, savePath, `${this.opts.user}@${this.opts.host}:~`];
        const sshArgs = ['-i', this.opts.key, `${this.opts.user}@${this.opts.host}`,
            `sudo cp ~/${fileName} ${appConfigPath};rm ~/${fileName}`];

        return this.writeFile(savePath, JSON.stringify(config, null, 2)).then(() => {
            return this.execute('scp', scpArgs);
        }).then(() => {
            return this.unlinkFile(savePath);
        }).then(() => {
            return this.execute('ssh', sshArgs);
        });
    }

    // Reloads the given application
    reloadApp(application) {
        const args = ['-i', this.opts.key, `${this.opts.user}@${this.opts.host}`,
            `sudo service ${application} reload`];

        return this.execute('ssh', args);
    }

    // Merges a given config Object with an existing one and reloads the corresponding application
    updateConfig(application) {
        const updatedConfig = { };
        const configs = Array.prototype.slice.call(arguments, 1);

        return this.getConfig(application).then(existingConfig => {
            ld.assign.apply(this, [updatedConfig, existingConfig].concat(configs));
            return this.setConfig(application, updatedConfig);
        }).then(() => {
            return this.reloadApp(application);
        });
    }
};
