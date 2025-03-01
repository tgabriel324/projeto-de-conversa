import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { useVideoStore } from "@/store/videoStore";
import { useQRCodeStore } from "@/store/qrCodeStore";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Camera, Download, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import VideoPlayer from "@/components/video/VideoPlayer";

interface CameraDevice {
  id: string;
  label: string;
}

interface QRScannerProps {
  onClose: () => void;
  forceInitialLoad?: boolean;
}

const QRScanner: React.FC<QRScannerProps> = ({ onClose, forceInitialLoad = false }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedVideo, setScannedVideo] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [cameraId, setCameraId] = useState<string>("");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(true);
  const [scanDebugInfo, setScanDebugInfo] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loadingState, setLoadingState] = useState<'initial' | 'loading' | 'loaded' | 'failed'>('initial');
  
  const { videos, getVideoById, fetchVideos } = useVideoStore();
  const { qrCodes, incrementScans, recordScanDetails, fetchQRCodes } = useQRCodeStore();
  
  useEffect(() => {
    console.log("Iniciando carregamento dos dados...");
    setLoadingState('loading');
    const loadData = async () => {
      try {
        setDataLoaded(false);
        console.log("Buscando QR codes e vídeos do banco de dados...");
        await Promise.all([fetchQRCodes(), fetchVideos()]);
        console.log(`Dados carregados: ${qrCodes.length} QR codes, ${videos.length} vídeos`);
        setDataLoaded(true);
        setLoadingState('loaded');
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        setLoadingState('failed');
        toast({
          title: "Erro ao carregar dados",
          description: "Não foi possível carregar os QR codes e vídeos. Tente novamente.",
          variant: "destructive"
        });
      }
    };
    
    loadData();
  }, [fetchQRCodes, fetchVideos]);

  useEffect(() => {
    if (!dataLoaded) return;
    
    const initializeScanner = async () => {
      setIsLoading(true);
      try {
        console.log("Inicializando scanner de QR code...");
        const devices = await Html5Qrcode.getCameras();
        console.log("Câmeras disponíveis:", devices);
        
        if (devices && devices.length) {
          setCameras(devices);
          setCameraId(devices[0].id);
          setHasPermission(true);
        } else {
          console.log("Nenhuma câmera encontrada");
          toast({
            title: "Câmera não encontrada",
            description: "Não foi possível encontrar uma câmera no seu dispositivo.",
            variant: "destructive"
          });
          setHasPermission(false);
        }
      } catch (error) {
        console.error("Erro ao acessar a câmera:", error);
        toast({
          title: "Erro ao acessar câmera",
          description: "Verifique se você concedeu permissão para a câmera.",
          variant: "destructive"
        });
        setHasPermission(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeScanner();
    
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(error => {
          console.error("Erro ao parar o scanner:", error);
        });
      }
    };
  }, [dataLoaded]);
  
  const startScanning = async () => {
    if (!cameraId) {
      toast({
        title: "Câmera não selecionada",
        description: "Por favor, selecione uma câmera para iniciar o escaneamento.",
        variant: "destructive"
      });
      return;
    }
    
    try {
      console.log("Iniciando scanner com câmera:", cameraId);
      const html5QrCode = new Html5Qrcode("qr-reader");
      scannerRef.current = html5QrCode;
      
      setScanning(true);
      setScannedVideo(null);
      
      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          handleSuccessfulScan(decodedText);
        },
        (errorMessage) => {
          if (errorMessage.includes("No MultiFormat Readers were able to detect the code")) {
            return;
          }
          console.log(errorMessage);
        }
      );
      
      toast({
        title: "Scanner iniciado",
        description: "Posicione um QR code na área indicada para escanear."
      });
    } catch (error) {
      console.error("Erro ao iniciar o scanner:", error);
      setScanning(false);
      toast({
        title: "Erro ao iniciar o scanner",
        description: "Verifique se você concedeu permissão para a câmera.",
        variant: "destructive"
      });
    }
  };
  
  const stopScanning = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        setScanning(false);
      } catch (error) {
        console.error("Erro ao parar o scanner:", error);
      }
    }
  };
  
  const handleSuccessfulScan = (decodedText: string) => {
    stopScanning();
    
    console.log("QR Code escaneado:", decodedText);
    console.log("QR codes disponíveis:", qrCodes);
    console.log("Vídeos disponíveis:", videos);
    
    if (!qrCodes || qrCodes.length === 0) {
      console.error("Nenhum QR code carregado para comparação");
      toast({
        title: "Nenhum QR code disponível",
        description: "Não há QR codes cadastrados no sistema para comparação.",
        variant: "destructive"
      });
      startScanning();
      return;
    }
    
    let qrCode = qrCodes.find(qr => qr.id === decodedText);
    
    if (!qrCode) {
      qrCode = qrCodes.find(qr => 
        decodedText.includes(qr.id) || 
        qr.id.includes(decodedText)
      );
    }
    
    if (!qrCode && decodedText.includes('/ar/')) {
      const parts = decodedText.split('/ar/');
      const potentialId = parts[parts.length - 1];
      
      qrCode = qrCodes.find(qr => 
        qr.id === potentialId || 
        potentialId.includes(qr.id) || 
        qr.id.includes(potentialId)
      );
    }
    
    if (qrCode) {
      console.log("QR code encontrado:", qrCode);
      
      if (!qrCode.videoId) {
        toast({
          title: "QR Code incompleto",
          description: "Este QR code não tem um vídeo associado.",
          variant: "destructive"
        });
        startScanning();
        return;
      }
      
      const videoExists = videos.some(v => v.id === qrCode?.videoId);
      console.log(`Verificação do videoId ${qrCode.videoId}: ${videoExists ? 'Encontrado' : 'Não encontrado'}`);
      
      const video = getVideoById(qrCode.videoId);
      
      if (video && video.url) {
        console.log("Vídeo encontrado:", video);
        
        setScannedVideo({
          url: video.url,
          title: video.title
        });
        
        incrementScans(qrCode.id);
        if (qrCode.analyticsEnabled) {
          recordScanDetails(qrCode.id, {});
        }
        
        toast({
          title: "QR Code reconhecido!",
          description: `Exibindo vídeo: ${video.title}`
        });
        
        setVideoPlaying(true);
      } else {
        console.error("Vídeo não encontrado para o QR code:", qrCode.videoId);
        setScanDebugInfo(`QR code encontrado (ID: ${qrCode.id}), mas o vídeo associado (VideoID: ${qrCode.videoId}) não foi encontrado.
        
Vídeos disponíveis (${videos.length}):
${videos.map(v => `- ${v.title} (ID: ${v.id})`).join('\n')}`);
        
        toast({
          title: "Vídeo não encontrado",
          description: "O vídeo associado a este QR code não foi encontrado. O ID pode estar incorreto ou o vídeo foi removido.",
          variant: "destructive"
        });
        
        startScanning();
      }
    } else {
      console.log("QR code não encontrado:", decodedText);
      setScanDebugInfo(`QR code lido (${decodedText}) não corresponde a nenhum QR code cadastrado.
      
QR codes disponíveis (${qrCodes.length}):
${qrCodes.map(qr => `- ${qr.videoTitle} (ID: ${qr.id})`).join('\n')}`);
      
      toast({
        title: "QR Code não reconhecido",
        description: "Este QR code não corresponde a nenhum dos QR codes cadastrados.",
        variant: "destructive"
      });
      
      startScanning();
    }
  };
  
  const changeCamera = async (deviceId: string) => {
    if (scanning) {
      await stopScanning();
    }
    
    setCameraId(deviceId);
    
    if (scanning) {
      setTimeout(() => startScanning(), 500);
    }
  };

  const requestCameraPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setHasPermission(true);
      
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setCameras(devices);
        setCameraId(devices[0].id);
      }
    } catch (error) {
      console.error("Erro ao solicitar permissão da câmera:", error);
      toast({
        title: "Permissão negada",
        description: "Você precisa conceder permissão para a câmera para usar o scanner.",
        variant: "destructive"
      });
    }
  };
  
  const exportDebugInfo = () => {
    if (!scanDebugInfo) return;
    
    const debugData = {
      timestamp: new Date().toISOString(),
      qrCodes: qrCodes,
      videos: videos,
      scanInfo: scanDebugInfo
    };
    
    const dataStr = JSON.stringify(debugData, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
    
    const exportFileDefaultName = `qr-scanner-debug-${Date.now()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast({
      title: "Informações exportadas",
      description: "As informações de diagnóstico foram exportadas com sucesso."
    });
  };
  
  const forceDataReload = async () => {
    setLoadingState('loading');
    try {
      const qrPromise = fetchQRCodes();
      const videoPromise = fetchVideos();
      
      await Promise.all([qrPromise, videoPromise]);
      setLoadingState('loaded');
      setDataLoaded(true);
      
      toast({
        title: "Dados recarregados",
        description: `${qrCodes.length} QR codes e ${videos.length} vídeos carregados do banco de dados.`
      });
      
      setScanDebugInfo(`Dados recarregados com sucesso:
- QR Codes: ${qrCodes.length}
- Vídeos: ${videos.length}

Exemplos de QR codes:
${qrCodes.slice(0, 3).map(qr => `- ${qr.videoTitle} (ID: ${qr.id.substring(0, 8)}..., VideoID: ${qr.videoId.substring(0, 8)}...)`).join('\n')}

Exemplos de vídeos:
${videos.slice(0, 3).map(v => `- ${v.title} (ID: ${v.id.substring(0, 8)}..., URL: ${v.url ? '✓' : '✗'})`).join('\n')}`);
    } catch (error) {
      console.error("Erro ao recarregar dados:", error);
      setLoadingState('failed');
      toast({
        title: "Erro ao recarregar dados",
        description: "Ocorreu um erro ao tentar recarregar os dados. Verifique a conexão com o banco de dados.",
        variant: "destructive"
      });
    }
  };
  
  if (loadingState === 'loading' || loadingState === 'initial') {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin mb-4">
          <RefreshCw className="h-8 w-8 text-primary" />
        </div>
        <p className="text-center text-muted-foreground">
          Carregando dados...
        </p>
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-4"
          onClick={forceDataReload}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
        
        {qrCodes.length > 0 && videos.length > 0 && (
          <div className="mt-8 max-w-md mx-auto w-full">
            <div className="bg-muted p-4 rounded-lg text-sm">
              <h3 className="font-medium mb-2">Dados disponíveis:</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-1">QR Codes disponíveis:</h4>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                    {qrCodes.slice(0, 3).map(qr => (
                      <li key={qr.id} className="text-muted-foreground">
                        {qr.videoTitle} (ID: {qr.id.substring(0, 8)}...)
                      </li>
                    ))}
                    {qrCodes.length > 3 && <li className="text-muted-foreground">E mais {qrCodes.length - 3}...</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-1">Vídeos disponíveis:</h4>
                  <ul className="list-disc pl-5 text-xs space-y-1">
                    {videos.slice(0, 3).map(v => (
                      <li key={v.id} className="text-muted-foreground">
                        {v.title} (ID: {v.id.substring(0, 8)}...)
                      </li>
                    ))}
                    {videos.length > 3 && <li className="text-muted-foreground">E mais {videos.length - 3}...</li>}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  
  if (loadingState === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-center mb-4">
          <RefreshCw className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Falha ao carregar dados</h3>
          <p className="text-muted-foreground mb-4">
            Não foi possível carregar os QR codes e vídeos do banco de dados.
          </p>
        </div>
        <div className="flex space-x-4">
          <Button variant="outline" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={forceDataReload}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-center mb-4">
          <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Permissão da Câmera Necessária</h3>
          <p className="text-muted-foreground mb-4">
            Para escanear QR codes, você precisa permitir o acesso à câmera do seu dispositivo.
          </p>
        </div>
        <div className="flex space-x-4">
          <Button variant="outline" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={requestCameraPermission}>
            <Camera className="mr-2 h-4 w-4" />
            Permitir Acesso
          </Button>
        </div>
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="animate-spin mb-4">
          <RefreshCw className="h-8 w-8 text-primary" />
        </div>
        <p className="text-center text-muted-foreground">
          Inicializando câmera...
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col space-y-4">
      {cameras.length > 1 && (
        <div className="mb-4">
          <label htmlFor="camera-select" className="block text-sm font-medium mb-2">
            Selecione a câmera:
          </label>
          <select
            id="camera-select"
            className="bg-background border border-input rounded-md w-full p-2"
            value={cameraId}
            onChange={(e) => changeCamera(e.target.value)}
            disabled={scanning}
          >
            {cameras.map((camera) => (
              <option key={camera.id} value={camera.id}>
                {camera.label || `Câmera ${camera.id.substring(0, 5)}...`}
              </option>
            ))}
          </select>
        </div>
      )}
      
      <div className="relative aspect-square md:aspect-video w-full">
        {!scannedVideo ? (
          <div className="h-full">
            <div 
              id="qr-reader" 
              className="w-full h-full rounded-lg overflow-hidden"
            ></div>
            
            {scanning && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-64 h-64 border-2 border-primary border-dashed rounded-lg flex items-center justify-center">
                  <div className="text-primary text-center px-4 py-2 bg-background/80 rounded-md">
                    Posicione o QR Code aqui
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full relative bg-black rounded-lg overflow-hidden">
            <VideoPlayer
              videoUrl={scannedVideo.url}
              autoPlay={videoPlaying}
              loop={true}
              controls={true}
              className="w-full h-full object-contain"
              onLoadedData={() => setVideoPlaying(true)}
            />
            
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4">
              <h3 className="text-white font-medium text-lg">{scannedVideo.title}</h3>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex justify-center mt-4 space-x-4">
        {!scannedVideo ? (
          <Button
            className="w-full sm:w-auto"
            onClick={scanning ? stopScanning : startScanning}
            variant={scanning ? "destructive" : "default"}
          >
            {scanning ? (
              <>
                <PauseCircle className="mr-2 h-5 w-5" />
                Parar Scanner
              </>
            ) : (
              <>
                <Camera className="mr-2 h-5 w-5" />
                Iniciar Scanner
              </>
            )}
          </Button>
        ) : (
          <div className="flex flex-col sm:flex-row w-full space-y-2 sm:space-y-0 sm:space-x-4">
            <Button 
              variant="outline" 
              className="w-full sm:w-auto"
              onClick={() => {
                setScannedVideo(null);
                startScanning();
              }}
            >
              <Camera className="mr-2 h-5 w-5" />
              Escanear novamente
            </Button>
            <Button 
              variant={videoPlaying ? "destructive" : "default"}
              className="w-full sm:w-auto"
              onClick={() => setVideoPlaying(!videoPlaying)}
            >
              {videoPlaying ? (
                <>
                  <PauseCircle className="mr-2 h-5 w-5" />
                  Pausar
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-5 w-5" />
                  Reproduzir
                </>
              )}
            </Button>
          </div>
        )}
      </div>
      
      {!scannedVideo && !scanning && (
        <div className="mt-4 text-center text-muted-foreground">
          <p>Toque em "Iniciar Scanner" para escanear um QR Code.</p>
          <p className="text-sm mt-1">Posicione o QR Code em frente à câmera para detectá-lo.</p>
        </div>
      )}

      {scanDebugInfo && (
        <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
          <div className="flex justify-between items-center mb-1">
            <p className="font-medium">Informações de diagnóstico:</p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={exportDebugInfo}
              disabled={!scanDebugInfo}
            >
              <Download className="h-4 w-4 mr-1" />
              Exportar
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-40">{scanDebugInfo}</pre>
        </div>
      )}

      <div className="mt-4">
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={forceDataReload}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Recarregar QR Codes e Vídeos do Banco de Dados
        </Button>
      </div>
    </div>
  );
};

export default QRScanner;
