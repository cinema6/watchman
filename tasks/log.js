'use strict';

module.exports = function(grunt) {
    grunt.registerTask('log', 'watch watchman log in vagrant', 'exec:log');
};
