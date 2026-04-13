import paramiko
import time

host = "187.77.189.149"
user = "root"
password = "@Mlaahlattendance123"

def run_cmd(ssh, cmd):
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    # Wait for completion and read output
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    
    if out.strip(): print(f"OUT: {out.strip()}")
    if err.strip(): print(f"ERR: {err.strip()}")
    return out + err

try:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {host}...")
    ssh.connect(host, username=user, password=password)

    # 1. Pull latest code to VPS
    print("\n--- 1. Pulling latest code ---\n")
    run_cmd(ssh, "cd /root/saas-edtech && git pull origin main")

    # 2. Setup Nginx for parents.mlaahl.online
    print("\n--- 2. Setting up Nginx ---\n")
    nginx_conf = """
server {
    listen 80;
    server_name parents.mlaahl.online;

    root /root/saas-edtech/parents;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
"""
    # Write to temp file then move to sites-available
    run_cmd(ssh, f"cat << 'EOF' > /etc/nginx/sites-available/parents\n{nginx_conf}\nEOF")
    
    # Enable site
    run_cmd(ssh, "ln -sf /etc/nginx/sites-available/parents /etc/nginx/sites-enabled/")
    
    # Test and reload
    run_cmd(ssh, "nginx -t")
    run_cmd(ssh, "systemctl reload nginx")

    # 3. Setup SSL with Certbot
    print("\n--- 3. Setting up SSL ---\n")
    run_cmd(ssh, "certbot --nginx -d parents.mlaahl.online --non-interactive --agree-tos -m admin@mlaahl.online || echo 'SSL already configured or skipped'")

    # 4. Restart backend just in case (to load new parentRoutes.js)
    print("\n--- 4. Restarting Backend ---\n")
    run_cmd(ssh, "cd /root/saas-edtech && pm2 restart attendance-backend")

    ssh.close()
    print("Deployment to parents.mlaahl.online Complete!")

except Exception as e:
    print(f"Error: {e}")
