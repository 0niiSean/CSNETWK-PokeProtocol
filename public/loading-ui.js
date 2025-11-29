document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("start-button");
    
    startButton.addEventListener('click', ()=> {
        window.location.href="battle-ui.html";
    });

    document.addEventListener('keydown', (event)=>{
        if (event.code == 'Space' || event.code === 'Enter'){
            event.preventDefault();
            startButton.click();
        }
    });
});