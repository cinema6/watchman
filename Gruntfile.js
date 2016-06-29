'use strict';

var path = require('path');

module.exports = function(grunt) {
    require('load-grunt-config')(grunt, {
        configPath: path.join(__dirname, 'tasks/options'),
        loadGruntTasks: {
            pattern: 'grunt*',
            config: require('./package.json'),
            scope: 'devDependencies'
        }
    });
    grunt.loadTasks('tasks');
};
