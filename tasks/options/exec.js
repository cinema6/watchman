module.exports = {
    rsync: {
        command: 'ssh -i .vagrant/machines/default/virtualbox/private_key vagrant@33.33.33.10 "sudo rsync --recursive --exclude=node_modules/*grunt* /vagrant/ /opt/sixxy/install/watchman/current; sudo service watchman restart"'
    }
};
