'use strict';

module.exports = function(grunt) {
    grunt.registerMultiTask('test', 'runs tests', function() {
        grunt.task.run('jasmine_nodejs:' + this.target);
    });
};
