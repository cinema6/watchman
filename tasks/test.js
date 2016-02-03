'use strict';

module.exports = function(grunt) {
    grunt.registerMultiTask('test', 'runs tests', function() {
        var target = this.target;
        var options = this.options();

        switch(target) {
        case 'unit':
            grunt.task.run('jasmine_nodejs:unit');
            break;
        case 'e2e':
            var mongoCfg = {
                host: options.mongoHost,
                port: 27017,
                db: 'c6Db',
                user: 'e2eTests',
                pass: 'password'
            };
            process.env.mongo = JSON.stringify(mongoCfg);
            grunt.task.run('jasmine_nodejs:e2e');
            break;
        }
    });
};
