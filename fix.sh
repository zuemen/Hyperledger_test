#!/bin/bash
echo '#!/bin/bash' > /usr/local/bin/docker-compose
echo 'exec docker compose "$@"' >> /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
