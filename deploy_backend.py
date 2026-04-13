import paramiko
import os
from scp import SCPClient

host = "187.77.189.149"
user = "root"
password = "@Mlaahlattendance123"
local_dir = r"e:\Desktop\new attendance\backend"
remote_dir = "/root/saas-edtech/backend"

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=user, password=password)

scp = SCPClient(ssh.get_transport())

print(f"Deploying backend from {local_dir} to {remote_dir}...")

count = 0
for root_path, dirs, files in os.walk(local_dir):
    # Skip node_modules
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    if '.git' in dirs:
        dirs.remove('.git')
        
    for f in files:
        if f == "nul": continue # Skip the 'nul' file if it causes issues on some systems
        
        local_file = os.path.join(root_path, f)
        rel = os.path.relpath(local_file, local_dir).replace("\\", "/")
        remote_file = f"{remote_dir}/{rel}"
        remote_subdir = os.path.dirname(remote_file)
        
        # Ensure remote directory exists
        ssh.exec_command(f"mkdir -p {remote_subdir}")
        
        scp.put(local_file, remote_file)
        count += 1
        print(f"  + {rel}")

print(f"\nDONE: Deployed {count} backend files to {remote_dir}")

# Restart PM2
print("Restarting PM2 backend...")
stdin, stdout, stderr = ssh.exec_command("cd /root/saas-edtech/backend && pm2 restart attendance-backend")
out = stdout.read().decode('utf-8', errors='replace')
filtered = ''.join(c if ord(c) < 128 else '?' for c in out)
print(filtered)

scp.close()
ssh.close()
print("All Done!")
