'use strict';

const APPS = [
    'devTimeStreamApplication',
    'devWatchmanStreamApplication',
    'devCwrxStreamApplication'
];
const SSH_CMD = 'ssh -i ~/.vagrant.d/insecure_private_key vagrant@33.33.33.20';

module.exports = {
    log: {
        command: `${SSH_CMD} tail -f /opt/sixxy/logs/watchman.log`
    },
    rsync: {
        command: function() {
            var cmd = APPS.map(app => {
                return 'sudo rsync --recursive --exclude=node_modules/* /vagrant/' +
                    ` /opt/sixxy/install/${app}/current;sudo service ${app} restart`;
            }).join(';');
            return `${SSH_CMD} "${cmd}"`;
        }
    },
    setup_e2e: {
        command: function() {
            return `node ${require.resolve('../../scripts/e2e_test_setup.js')}`;
        }
    }
};
