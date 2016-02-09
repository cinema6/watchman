'use strict';

module.exports = function(grunt) {
    grunt.registerTask('tdd', 'runs tests on code changes', 'watch:tdd');
    grunt.registerTask('tdd:vagrant', 'runs tests on code changes', 'watch:vagrant');
};
