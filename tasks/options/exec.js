'use strict';

module.exports = {
    rsync: {
        command: 'ssh -i ~/.vagrant.d/insecure_private_key vagrant@33.33.33.20' +
            ' "sudo rsync --recursive --exclude=node_modules/*grunt* /vagrant/' +
            ' /opt/sixxy/install/watchman/current; sudo service watchman restart"'
    }
};
