#!/usr/bin/env python3
"""
Shen3D Claude Code Monitor — Handles rate limits automatically.
- Monitors tmux session for progress
- Detects rate limit errors (429, quota exceeded, etc.)
- Waits and restarts Claude Code when limits reset
- Logs progress to file
"""

import subprocess, time, re, json, os, sys
from datetime import datetime

SESSION = "shen3d"
PROJECT_DIR = "/home/hermes-workspace/projects/shen3d-cutter"
LOG_FILE = "/home/hermes-workspace/projects/shen3d-cutter/monitor.log"
RATE_LIMIT_WAIT = 300  # 5 minutes between retries
MAX_RETRIES = 20
MODEL = "hf:zai-org/GLM-5.1"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

def capture_tmux():
    try:
        result = subprocess.run(
            ["tmux", "capture-pane", "-t", SESSION, "-p", "-S", "-80"],
            capture_output=True, text=True, timeout=10
        )
        return result.stdout
    except Exception as e:
        log(f"tmux capture error: {e}")
        return ""

def is_session_alive():
    result = subprocess.run(["tmux", "has-session", "-t", SESSION], capture_output=True)
    return result.returncode == 0

def is_claude_working(output):
    """Check if Claude Code is actively working or waiting for input."""
    # Active indicators: ●, ⎿, Running…, thinking
    active_markers = ["●", "⎿", "Running", "thinking", "Reading", "Writing", "Bash("]
    for marker in active_markers:
        if marker in output:
            return True
    # Waiting for input: ❯ at bottom
    lines = output.strip().split("\n")
    if lines and "❯" in lines[-1]:
        return False  # Claude done or waiting
    return False

def has_rate_limit_error(output):
    """Detect rate limit / quota errors."""
    patterns = [
        r"429",
        r"rate.?limit",
        r"quota",
        r"too many requests",
        r"exceeded",
        r"overloaded",
        r"billing_error",
        r"API Error",
        r"error_max_turns",
        r"budget",
    ]
    for p in patterns:
        if re.search(p, output, re.IGNORECASE):
            return True
    return False

def get_task_progress(output):
    """Extract current task from todo list."""
    match = re.search(r"◼ (Task \d+:.+)", output)
    if match:
        return match.group(1)
    match = re.search(r"✔ (Task \d+:.+)", output)
    if match:
        return f"COMPLETED: {match.group(1)}"
    return "unknown"

def kill_session():
    subprocess.run(["tmux", "kill-session", "-t", SESSION], capture_output=True)
    time.sleep(2)

def start_claude(prompt=None):
    """Start Claude Code in tmux session."""
    kill_session()
    subprocess.run(["tmux", "new-session", "-d", "-s", SESSION, "-x", "200", "-y", "50"], capture_output=True)
    time.sleep(0.5)
    
    if prompt is None:
        prompt = "Continua l'implementazione della FASE 1 dal punto in cui eri rimasto. Leggi il file CLAUDE.md per il contesto. Procedi con i task rimanenti. Dopo ogni task, fai commit. Alla fine, esegui npm run build."
    
    cmd = f"""cd {PROJECT_DIR} && claude --model "{MODEL}" --allowedTools "Read,Write,Edit,Bash" --permission-mode auto "{prompt}" """
    subprocess.run(["tmux", "send-keys", "-t", SESSION, cmd, "Enter"], capture_output=True)
    time.sleep(15)
    
    # Handle setup dialogs
    output = capture_tmux()
    if "Dark mode" in output or "Auto (match terminal)" in output:
        subprocess.run(["tmux", "send-keys", "-t", SESSION, "Enter"], capture_output=True)
        time.sleep(5)
    
    output = capture_tmux()
    if "Do you want to use this API key" in output:
        subprocess.run(["tmux", "send-keys", "-t", SESSION, "Up", "Enter"], capture_output=True)
        time.sleep(3)
    
    output = capture_tmux()
    if "Press Enter to continue" in output:
        subprocess.run(["tmux", "send-keys", "-t", SESSION, "Enter"], capture_output=True)
        time.sleep(3)
    
    output = capture_tmux()
    if "Yes, I trust this folder" in output:
        subprocess.run(["tmux", "send-keys", "-t", SESSION, "Enter"], capture_output=True)
        time.sleep(3)
    
    output = capture_tmux()
    if "auto mode" in output.lower():
        subprocess.run(["tmux", "send-keys", "-t", SESSION, "Down", "Enter"], capture_output=True)
        time.sleep(5)
    
    log("Claude Code started/restarted in tmux")

def main():
    log("=== Shen3D Monitor Started ===")
    log(f"Rate limit wait: {RATE_LIMIT_WAIT}s, Max retries: {MAX_RETRIES}")
    
    retries = 0
    idle_count = 0
    last_task = ""
    
    while retries < MAX_RETRIES:
        if not is_session_alive():
            log("Session died, restarting...")
            start_claude()
            idle_count = 0
            continue
        
        output = capture_tmux()
        current_task = get_task_progress(output)
        
        if current_task != last_task and current_task != "unknown":
            log(f"Progress: {current_task}")
            last_task = current_task
        
        # Check for rate limit
        if has_rate_limit_error(output):
            retries += 1
            log(f"⚠️ Rate limit detected (retry {retries}/{MAX_RETRIES})")
            log(f"Waiting {RATE_LIMIT_WAIT}s before retry...")
            kill_session()
            time.sleep(RATE_LIMIT_WAIT)
            log("Retrying...")
            start_claude()
            idle_count = 0
            continue
        
        # Check if Claude is working
        if is_claude_working(output):
            idle_count = 0
            time.sleep(30)  # Check every 30s while working
            continue
        
        # Claude might be idle / done
        idle_count += 1
        
        if idle_count >= 3:
            # Check if build passes
            log("Claude seems done, checking build...")
            build_result = subprocess.run(
                ["npm", "run", "build"],
                capture_output=True, text=True,
                cwd=PROJECT_DIR, timeout=120
            )
            
            if build_result.returncode == 0:
                log("✅ BUILD PASSED — Fase 1 completata!")
                log("Sending notification...")
                # Signal completion
                with open("/tmp/shen3d-fase1-complete", "w") as f:
                    f.write(f"completed_at={datetime.now().isoformat()}\n")
                    f.write(f"build_exit=0\n")
                return  # Done!
            else:
                log(f"Build failed, restarting Claude to fix... {build_result.stdout[-500:]}")
                start_claude("Il build ha fallito. Leggi gli errori di 'npm run build' e correggili. Poi rifai il build.")
                idle_count = 0
                continue
        
        time.sleep(20)
    
    log("❌ Max retries reached. Monitor stopping.")

if __name__ == "__main__":
    main()
