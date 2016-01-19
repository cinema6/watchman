# Downloads Ivy and uses it to install the KCL along with its dependencies

IVY_URL="http://search.maven.org/remotecontent?filepath=org/apache/ivy/ivy/2.4.0/ivy-2.4.0.jar"
IVY_FILENAME="ivy-2.4.0.jar"

mkdir -p ./jars
if [ ! -f ./jars/$IVY_FILENAME ]; then
  echo 'Downloading ivy...'
  wget -O ./jars/$IVY_FILENAME $IVY_URL
fi
echo 'Downloading dependencies...'
java -jar ./jars/$IVY_FILENAME \
     -dependency com.amazonaws amazon-kinesis-client 1.6.1 \
     -retrieve "./jars/[artifact]-[revision](-[classifier]).[ext]"
