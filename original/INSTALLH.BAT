echo off
rem installh.bat
rem  190294im
cls
if "%1" == "" goto parerr
if "%2" == "" goto parerr
if "%3" == "" gogo parerr
echo ***********************
echo *  Daten kopieren...  *
echo ***********************
echo.
echo    von Laufwerk %1
echo    zu %2%3 
echo.
copy %1\*.* %2%3 /v
cls
echo *************************************************************
echo *  Installation von LITTLE WILLY erfolgreich abgeschlossen  *
echo *************************************************************
echo.
echo    auf Laufwerk %2 Verzeichnis %3
echo.
echo *************************************************************
echo *                  LW eingeben zum Starten                  *
echo *************************************************************
echo.
goto prgend
:parerr
cls
echo Keine oder falsche Parameter angegeben !
echo Aufruf per 'INSTALL':
echo    install [Quell-Laufwerk] [Ziel-Laufwerke] [Ziel-Verzeichnis]
:prgend
rem EOF
