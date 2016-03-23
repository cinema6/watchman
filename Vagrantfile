# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  # Box to build off of
  config.vm.box = "Reelcontent-CentOS-6.3-x86_64-1.0.0.box"
  config.vm.box_url = "https://s3.amazonaws.com/c6.dev/VagrantBoxes/Reelcontent-CentOS-6.3-x86_64-1.0.0.box"

  # Create a private network, which allows host-only access to the machine
  # using a specific IP.
  config.vm.network "private_network", ip: "33.33.33.20"
  config.vm.provider :virtualbox do |vb|
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
    vb.memory = 1024
  end

  # Use the default insecure key
  config.ssh.insert_key = false

  # Enable the Berkshelf plugin
  config.berkshelf.enabled = true

  config.omnibus.chef_version = :latest

  # Provision with chef solo
  config.vm.provision "chef_solo" do |chef|
    chef.data_bags_path = "#{ENV['CHEF_REPO']}/data_bags"
    chef.encrypted_data_bag_secret_key_path = "#{ENV['HOME']}/.chef/c6data.pem"
    chef.roles_path = "../cookbooks/watchman/roles"
    chef.environments_path = "../cookbooks/watchman/environments"
    chef.add_role "test"
    chef.environment = "development"
    chef.json = {
        :watchman => {
            :awsAuth => JSON.parse(File.read("#{ENV['HOME']}/.aws.json")),
            :rsyslog => {
                :hostname => ENV["USER"],
                :monitor => true,
                :watchman => {
                    :token => "fac240ab-aa03-4430-8966-a474b92773d3"
                },
                :devTimeStreamApplication => {
                    :token => "64ae1c2d-3425-4337-841f-df86e3362ebb"
                },
                :devWatchmanStreamApplication => {
                    :token => "e488a8de-462d-4f59-ad68-f7cf2f268c3d"
                },
                :devCwrxStreamApplication => {
                    :token => "86527b56-b848-4c65-b274-33e09cf2a9eb"
                }
            },
            :app => {
                :cwrx => {
                    :auth => {
                        :endpoint => ":3200/api/auth"
                    },
                    :campaigns => {
                        :endpoint => ":3900/api/campaigns"
                    }
                }
            }
        }
    }
  end
end
