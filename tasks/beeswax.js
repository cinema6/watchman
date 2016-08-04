'use strict';

var BeeswaxHelper = require('../tests/helpers/BeeswaxHelper');

module.exports = function(grunt) {

    grunt.registerTask('beeswax', 'does beeswax stuff', function(cmd) {
        const done = this.async(), beeswax = new BeeswaxHelper();

        if (cmd === 'clean') {
            grunt.log.writelns('Cleanup all test advertisers.');
            return beeswax.cleanupAllTestAdvertisers()
            .then(function(){
                done(true);
            })
            .catch(function(err){
                grunt.log.errorlns('Error cleaning test advertisers: ' + err.message);
                done(false);
            });
        }

        grunt.log.errorlns('Unrecognized command: ',cmd);
        done(false);

    });

};
