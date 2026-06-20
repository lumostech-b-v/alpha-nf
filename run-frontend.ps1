$env:PATH = "C:\Program Files\nodejs;" + [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
cd C:\Users\farha\Downloads\neuro-feedback-dev\frontend
& "C:\Program Files\nodejs\npm.cmd" run dev
