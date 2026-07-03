echo off
rem install.bat
rem 180294im
rem install inst-prg.
cls
if "%1" == "" goto parerr
if "%2" == "" goto parerr
if "%3" == "" goto parerr
echo **************************************************
echo *  Installation von LITTLE WILLY auf Festplatte  *
echo **************************************************
echo.
echo    Quelle: Laufwerk %1                         
echo    Ziel:   %2%3                                
echo.                                             
echo **************************************************      
echo *            Falls Angaben nicht O.K.            *      
echo *         Ctrl - C zum Abrechen drÅcken          *      
echo **************************************************      
echo. 
pause
copy %1\installh.bat %2%3 /v
%2
cd %3
installh.bat %1 %2 %3
goto prgend
:parerr
echo Keine oder falsche Parameter angegeben !
echo Aufruf:
echo    install [Quell-Laufwerk] [Ziel-Laufwerke] [Ziel-Verzeichnis]
:prgend
rem EOF
