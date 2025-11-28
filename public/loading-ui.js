document.addEventListener("DOMContentLoaded", () => {
    const loadingText = document.getElementById("start-button");
    
    startButton.addEventListener('click', ()=> {
        window.location.href="connect-ui.html";
    });

    document.addEventListener('keydown', (event)=>{
        if (event.code == 'Space' || event.code === 'Enter'){
            event.preventDefault();
            startButton.click();
        }
    });
});