'use strict';

var SSH_CMD = 'ssh -i ~/.vagrant.d/insecure_private_key vagrant@33.33.33.20';

module.exports = {
    log: {
        command: SSH_CMD + ' tail -f /opt/sixxy/logs/watchman.log'
    },
    rsync: {
        command: function() {
            var apps = ['devTimeStreamApplication', 'devWatchmanStreamApplication'];
            var cmd = apps.map(function(app) {
                return 'sudo rsync --recursive --exclude=node_modules/* /vagrant/' +
                    ' /opt/sixxy/install/' + app + '/current;sudo service ' + app + ' restart';
            }).join(';');
            return SSH_CMD + ' "' + cmd + '"';
        }
    }
};
